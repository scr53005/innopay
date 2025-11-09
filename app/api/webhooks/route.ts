// app/api/webhooks/route.ts - Updated to support multiple checkout flows
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Import database functions
import {
  findLastHiveAccount,
  findInnoUserByEmail,
  createNewInnoUserWithTopupAndAccount,
  createTopupForExistingUser,
  nextAccountName,
  getActiveCampaign,
  getBonusCountForCampaign,
  createBonus,
  findGuestCheckoutBySessionId,
  updateGuestCheckout,
  createWalletUser,
} from '@/services/database';

// Import Hive functions
import {
  generateHiveKeys,
  createAndBroadcastHiveAccount,
  findNextAvailableAccountName,
  getSeed,
  transferEuroTokens,
  transferHbd,
  transferEuroTokensFromAccount,
  accountExists,
} from '@/services/hive';

// Import currency functions
import { convertHbdToEur } from '@/services/currency';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  let event: Stripe.Event;
  const buf = await req.text();
  console.log('Webhook received, headers:', req.headers);
  const sig = req.headers.get('stripe-signature');

  // Verify webhook signature
  try {
    if (sig) {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } else {
      // Mock mode for local testing (no signature)
      console.warn("No Stripe-Signature header found. Assuming mock mode.");
      event = {
        id: 'evt_mock_' + Date.now(),
        object: 'event',
        api_version: '2024-06-20',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: 'req_mock', idempotency_key: null },
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_mock_' + Date.now(),
            object: 'checkout.session',
            amount_total: 3500, // 35 EUR in cents
            currency: 'eur',
            customer_details: {
              email: 'test@innopay.lu',
            },
            payment_status: 'paid',
            status: 'complete',
            metadata: {},
          } as Stripe.Checkout.Session,
        },
      } as Stripe.Event;
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`Processing checkout session: ${session.id}`);
    console.log(`Metadata:`, session.metadata);

    const flow = session.metadata?.flow;

    try {
      if (flow === 'guest') {
        // === GUEST CHECKOUT FLOW ===
        return await handleGuestCheckout(session);
      } else if (flow === 'account_creation') {
        // === ACCOUNT CREATION FLOW ===
        return await handleAccountCreation(session);
      } else {
        // === LEGACY FLOW (email-based, sequential account names) ===
        return await handleLegacyFlow(session);
      }
    } catch (error: any) {
      console.error(`Error processing checkout session ${session.id}:`, error);
      return NextResponse.json(
        { error: 'Processing failed', message: error.message },
        { status: 500 }
      );
    }
  }

  // Handle other event types
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment Intent Succeeded:', event.data.object.id);
      break;
    case 'payment_method.attached':
      console.log('Payment Method Attached:', event.data.object.id);
      break;
    case 'charge.updated':
    case 'charge.succeeded':
    case 'payment_intent.created':
    case 'payment_intent.payment_failed':
      // Informational events - acknowledge but don't process
      console.log(`Stripe event received (no action needed): ${event.type}`);
      break;
    default:
      console.log(`Unhandled event type (ignored): ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ========================================
// GUEST CHECKOUT FLOW HANDLER
// ========================================
async function handleGuestCheckout(session: Stripe.Checkout.Session) {
  console.log(`[GUEST] Processing guest checkout: ${session.id}`);

  const { hbdAmount, recipient, memo } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;

  // Validate metadata
  if (!hbdAmount || !recipient || !memo) {
    throw new Error('Missing required metadata for guest checkout');
  }

  const hbdAmountNum = parseFloat(hbdAmount);

  // Find the guest checkout record
  const guestCheckout = await findGuestCheckoutBySessionId(session.id);
  if (!guestCheckout) {
    throw new Error(`Guest checkout record not found for session ${session.id}`);
  }

  try {
    // Transfer HBD from innopay to recipient (e.g., indies.cafe)
    console.log(`[GUEST] Transferring ${hbdAmountNum} HBD to ${recipient}`);
    const hiveTxId = await transferHbd(recipient, hbdAmountNum, memo);
    console.log(`[GUEST] HBD transfer successful: ${hiveTxId}`);

    // Try to update DB, but don't fail if it errors
    try {
      await updateGuestCheckout(session.id, hiveTxId, 'completed');
      console.log('[GUEST] Database updated successfully');
    } catch (dbError) {
      console.error('[GUEST] WARNING: Database update failed, but HBD transfer succeeded:', dbError);
      // Don't throw - the payment went through, just log the DB issue
    }

    return NextResponse.json({
      message: 'Guest checkout completed successfully',
      hiveTxId,
    }, { status: 200 });

  } catch (hiveError: any) {
    console.error('[GUEST] HBD transfer failed:', hiveError);

    // Check if it's an insufficient funds error
    if (hiveError.message.includes('insufficient') || hiveError.message.includes('balance')) {
      // Transfer EURO tokens instead (unlimited supply)
      console.warn('[GUEST] Insufficient HBD, transferring EURO tokens instead');
      try {
        // Use the original EUR amount from Stripe (EURO tokens represent EUR 1:1)
        const euroTxId = await transferEuroTokens(recipient, amountEuro, memo);
        console.log(`[GUEST] EURO tokens transferred successfully: ${euroTxId}`);

        // Try to update DB, but don't fail if it errors
        try {
          await updateGuestCheckout(session.id, euroTxId, 'completed_euro_fallback');
          console.log('[GUEST] Database updated successfully');
        } catch (dbError) {
          console.error('[GUEST] WARNING: Database update failed, but EURO transfer succeeded:', dbError);
          // Don't throw - the payment went through, just log the DB issue
        }

        return NextResponse.json({
          message: 'Guest checkout completed with EURO tokens (HBD insufficient)',
          euroTxId,
          warning: 'Used EURO tokens due to insufficient HBD balance',
        }, { status: 200 });
      } catch (euroError) {
        console.error('[GUEST] EURO token transfer also failed:', euroError);
        try {
          await updateGuestCheckout(session.id, null, 'failed');
        } catch (dbError) {
          console.error('[GUEST] DB update failed (transfer also failed):', dbError);
        }
        throw new Error('Both HBD and EURO transfers failed');
      }
    }

    // For other errors, mark as failed
    try {
      await updateGuestCheckout(session.id, null, 'failed');
    } catch (dbError) {
      console.error('[GUEST] DB update failed (HBD transfer failed):', dbError);
    }
    throw hiveError;
  }
}

// ========================================
// ACCOUNT CREATION FLOW HANDLER
// ========================================
async function handleAccountCreation(session: Stripe.Checkout.Session) {
  console.log(`[ACCOUNT] Processing account creation: ${session.id}`);

  const { accountName, hbdTransfer } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;
  const customerEmail = session.customer_details?.email;

  // Validate metadata
  if (!accountName) {
    throw new Error('Missing accountName in session metadata');
  }

  // Validate minimum amount
  if (amountEuro < 30) {
    throw new Error(`Amount ${amountEuro} EUR is below minimum of 30 EUR`);
  }

  // Check if account already exists
  console.log(`[ACCOUNT] Checking if ${accountName} already exists...`);
  const exists = await accountExists(accountName);
  if (exists) {
    console.error(`[ACCOUNT] Account ${accountName} already exists!`);
    // TODO: In production, trigger Stripe refund here
    throw new Error(`Account ${accountName} already exists`);
  }

  // Generate seed and keys
  const seed = getSeed(accountName);
  const keychain = generateHiveKeys(accountName, seed);

  // Create Hive account
  console.log(`[ACCOUNT] Creating Hive account: ${accountName}`);
  const hiveTxId = await createAndBroadcastHiveAccount(accountName, keychain);
  console.log(`[ACCOUNT] Account created successfully: ${hiveTxId}`);

  // Save to walletuser table with seed and masterPassword
  console.log(`[ACCOUNT] Saving to walletuser table with seed and masterPassword`);
  await createWalletUser(accountName, hiveTxId, seed, keychain.masterPassword);

  // Save to database (legacy innouser table if email provided)
  let userId: number | null = null;
  if (customerEmail) {
    const createdRecords = await createNewInnoUserWithTopupAndAccount(
      customerEmail,
      amountEuro,
      seed,
      accountName,
      hiveTxId
    );
    userId = createdRecords[0].id;
    console.log(`[ACCOUNT] Database records created for user ID: ${userId}`);
  } else {
    console.warn('[ACCOUNT] No email provided, account created but not linked to innouser');
  }

  // Check for campaign eligibility and calculate bonus
  let bonusAmount = 0;
  const campaign = await getActiveCampaign();

  if (campaign) {
    const bonusCount = await getBonusCountForCampaign(campaign.id);
    console.log(`[ACCOUNT] Campaign ${campaign.id}: count50=${bonusCount.count50}, count100=${bonusCount.count100}`);

    if (amountEuro >= parseFloat(campaign.minAmount100.toString()) && bonusCount.count100 < campaign.maxUsers100) {
      bonusAmount = parseFloat(campaign.bonus100.toString());
      await createBonus(campaign.id, userId, null, accountName, bonusAmount);
      console.log(`[ACCOUNT] Applied 100 EUR tier bonus: ${bonusAmount} EURO`);
    } else if (amountEuro >= parseFloat(campaign.minAmount50.toString()) && bonusCount.count50 < campaign.maxUsers50) {
      bonusAmount = parseFloat(campaign.bonus50.toString());
      await createBonus(campaign.id, userId, null, accountName, bonusAmount);
      console.log(`[ACCOUNT] Applied 50 EUR tier bonus: ${bonusAmount} EURO`);
    }
  }

  // Transfer EURO tokens (base amount + bonus)
  const totalEuro = amountEuro + bonusAmount;
  console.log(`[ACCOUNT] Transferring ${totalEuro} EURO tokens (${amountEuro} + ${bonusAmount} bonus)`);
  const euroTxId = await transferEuroTokens(accountName, totalEuro);
  console.log(`[ACCOUNT] EURO tokens transferred: ${euroTxId}`);

  // Handle HBD transfer if coming from indiesmenu order
  let hbdTxId: string | undefined;
  let euroFromAccountTxId: string | undefined;

  if (hbdTransfer) {
    const transfer = JSON.parse(hbdTransfer);
    console.log(`[ACCOUNT] Processing indiesmenu order transfer:`, transfer);

    try {
      // Transfer HBD from innopay account to recipient
      hbdTxId = await transferHbd(transfer.recipient, transfer.hbdAmount, transfer.memo);
      console.log(`[ACCOUNT] HBD transferred: ${hbdTxId}`);

      // Transfer EURO tokens from newly created account to recipient (using innopay authority)
      const euroAmountForOrder = convertHbdToEur(transfer.hbdAmount, transfer.eurUsdRate);
      euroFromAccountTxId = await transferEuroTokensFromAccount(
        accountName,
        transfer.recipient,
        euroAmountForOrder,
        transfer.memo
      );
      console.log(`[ACCOUNT] EURO tokens transferred from new account: ${euroFromAccountTxId}`);
    } catch (transferError) {
      console.error('[ACCOUNT] Order transfer failed:', transferError);
      // Account is created, but order payment failed - log for manual reconciliation
      // Don't throw error - account creation was successful
    }
  }

  return NextResponse.json({
    message: 'Account created successfully',
    accountName,
    hiveTxId,
    euroTxId,
    bonusAmount,
    hbdTxId,
    euroFromAccountTxId,
  }, { status: 201 });
}

// ========================================
// LEGACY FLOW HANDLER (backward compatibility)
// ========================================
async function handleLegacyFlow(session: Stripe.Checkout.Session) {
  console.log(`[LEGACY] Processing legacy checkout: ${session.id}`);

  const customerEmail = session.customer_details?.email;
  const amountInEuro = (session.amount_total || 0) / 100;

  if (!customerEmail) {
    throw new Error('No customer email found in checkout session');
  }

  // Check if user exists
  let innoUser = await findInnoUserByEmail(customerEmail);

  if (!innoUser) {
    // New user - create account with sequential naming
    if (amountInEuro >= 30) {
      console.log(`[LEGACY] Creating new user for ${customerEmail} with ${amountInEuro} EUR`);

      const lastAccount = await findLastHiveAccount();
      const accountName = await findNextAvailableAccountName(nextAccountName(lastAccount));
      const seed = getSeed(accountName);
      const keychain = generateHiveKeys(accountName, seed);

      const hiveTxId = await createAndBroadcastHiveAccount(accountName, keychain);

      const createdRecords = await createNewInnoUserWithTopupAndAccount(
        customerEmail,
        amountInEuro,
        seed,
        accountName,
        hiveTxId
      );
      innoUser = createdRecords[0];

      const tokenTxId = await transferEuroTokens(accountName, amountInEuro);
      console.log(`[LEGACY] New user created: ${accountName}, EURO tokens: ${tokenTxId}`);

      return NextResponse.json({
        message: `Successfully created new user: ${customerEmail}`,
        accountName,
        hiveTxId,
        euroTokenTxId: tokenTxId,
      }, { status: 201 });
    } else {
      throw new Error('Minimum top-up is 30 EUR for new accounts');
    }
  } else {
    // Existing user - top-up only
    console.log(`[LEGACY] Topping up existing user ${customerEmail} with ${amountInEuro} EUR`);

    if (!innoUser.bip39seedandaccount) {
      throw new Error('User exists but has no account provisioned');
    }

    await createTopupForExistingUser(innoUser.id, amountInEuro);

    const accountName = innoUser.bip39seedandaccount.accountName;
    const tokenTxId = await transferEuroTokens(accountName, amountInEuro);
    console.log(`[LEGACY] Top-up complete: ${tokenTxId}`);

    return NextResponse.json({
      message: `Successfully topped up existing user: ${customerEmail}`,
      userId: innoUser.id,
      euroTokenTxId: tokenTxId,
    }, { status: 200 });
  }
}
