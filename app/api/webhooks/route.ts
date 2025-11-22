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
  getRecipientForEnvironment,
} from '@/services/hive';

// Import currency functions
import { convertHbdToEur, getEurUsdRateServerSide, convertEurToHbd } from '@/services/currency';

// Import Prisma
import prisma from '@/lib/prisma';

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
      } else if (flow === 'topup') {
        // === TOP-UP FLOW (existing account) ===
        return await handleTopup(session);
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

        // Record debt - innopay owes HBD to restaurant
        const eurUsdRate = hbdAmountNum / amountEuro; // Calculate rate from amounts
        await prisma.outstanding_debt.create({
          data: {
            creditor: getRecipientForEnvironment(recipient),
            amount_hbd: hbdAmountNum,
            euro_tx_id: euroTxId, // Use the EURO fallback TX as reference
            eur_usd_rate: eurUsdRate,
            reason: 'guest_checkout',
            notes: `Guest checkout - HBD shortage at ${new Date().toISOString()}`
          }
        });

        console.log(`📝 [DEBT] Recorded ${hbdAmountNum} HBD debt to restaurant (guest checkout)`);

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
// TOP-UP FLOW HANDLER
// ========================================
async function handleTopup(session: Stripe.Checkout.Session) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WEBHOOK TOPUP] ========================================`);
  console.log(`[${timestamp}] [WEBHOOK TOPUP] Processing top-up: ${session.id}`);
  console.log(`[${timestamp}] [WEBHOOK TOPUP] Full metadata:`, JSON.stringify(session.metadata, null, 2));

  const { accountName, orderAmountEuro, orderMemo } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;
  const customerEmail = session.customer_details?.email;
  const orderCost = orderAmountEuro ? parseFloat(orderAmountEuro) : 0;

  console.log(`[${timestamp}] [WEBHOOK TOPUP] Top-up info:`, {
    accountName,
    amountEuro,
    orderCost,
    customerEmail,
    hasOrderMemo: !!orderMemo
  });

  // Validate metadata
  if (!accountName) {
    throw new Error('Missing accountName in session metadata');
  }

  // Validate minimum amount (15 EUR for top-ups)
  if (amountEuro < 15) {
    throw new Error(`Amount ${amountEuro} EUR is below minimum of 15 EUR for top-up`);
  }

  // Verify account exists
  console.log(`[TOPUP] Verifying account ${accountName} exists...`);
  const exists = await accountExists(accountName);
  if (!exists) {
    console.error(`[TOPUP] Account ${accountName} does not exist!`);
    throw new Error(`Account ${accountName} does not exist. Cannot top-up non-existent account.`);
  }

  console.log(`[TOPUP] Account verified.`);

  // Calculate how much goes to user vs restaurant
  const userCredit = orderCost > 0 ? amountEuro - orderCost : amountEuro;

  let userTxId: string | undefined;
  let restaurantTxId: string | undefined;

  // Transfer user's portion (if any)
  if (userCredit > 0) {
    console.log(`[TOPUP] Transferring ${userCredit} EURO tokens to ${accountName} (user credit)`);
    userTxId = await transferEuroTokens(accountName, userCredit, `Top-up credit: ${userCredit} EUR`);
    console.log(`[TOPUP] User credit transferred: ${userTxId}`);
  } else {
    console.log(`[TOPUP] No user credit (full amount goes to restaurant)`);
  }

  // Transfer restaurant order (if pending order exists)
  if (orderCost > 0 && orderMemo) {
    console.log(`[TOPUP] Processing restaurant order: ${orderCost} EUR to indies.cafe`);

    // Get EUR/USD rate for HBD conversion
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const requiredHbd = orderCost * eurUsdRate;

    // Check innopay HBD balance
    const Client = (await import('@hiveio/dhive')).Client;
    const client = new Client([
      'https://api.hive.blog',
      'https://api.deathwing.me',
      'https://hive-api.arcange.eu'
    ]);

    const accounts = await client.database.getAccounts(['innopay']);
    if (!accounts || accounts.length === 0) {
      throw new Error('Innopay account not found');
    }

    const hbdBalanceStr = typeof accounts[0].hbd_balance === 'string'
      ? accounts[0].hbd_balance
      : accounts[0].hbd_balance.toString();
    const hbdBalance = parseFloat(hbdBalanceStr.split(' ')[0]);

    console.log(`[TOPUP] Innopay HBD balance: ${hbdBalance}, Required: ${requiredHbd}`);

    if (hbdBalance >= requiredHbd) {
      // Transfer HBD from innopay to restaurant
      console.log(`[TOPUP] Sufficient HBD, transferring ${requiredHbd} HBD to indies.cafe`);
      try {
        restaurantTxId = await transferHbd('indies.cafe', requiredHbd, orderMemo);
        console.log(`[TOPUP] HBD transfer successful: ${restaurantTxId}`);
      } catch (hbdError: any) {
        console.warn(`[TOPUP] ⚠️ HBD transfer failed despite sufficient balance:`, hbdError.message);

        // Record debt - innopay owes HBD to restaurant
        await prisma.outstanding_debt.create({
          data: {
            creditor: getRecipientForEnvironment('indies.cafe'),
            amount_hbd: requiredHbd,
            euro_tx_id: userTxId || 'TOPUP_NO_USER_TX',
            eur_usd_rate: eurUsdRate,
            reason: 'topup_order',
            notes: `HBD transfer failed at ${new Date().toISOString()} - ${hbdError.message}`
          }
        });

        console.log(`📝 [DEBT] Recorded ${requiredHbd} HBD debt to restaurant`);

        // Fall back to EURO
        restaurantTxId = await transferEuroTokens('indies.cafe', orderCost, orderMemo);
        console.log(`[TOPUP] EURO fallback transfer successful: ${restaurantTxId}`);
      }
    } else {
      // Insufficient HBD - transfer EURO tokens and record debt
      console.log(`[TOPUP] Insufficient HBD, transferring ${orderCost} EURO to indies.cafe`);

      // Record debt - innopay should have paid HBD but paid EURO instead
      await prisma.outstanding_debt.create({
        data: {
          creditor: getRecipientForEnvironment('indies.cafe'),
          amount_hbd: requiredHbd,
          euro_tx_id: userTxId || 'TOPUP_NO_USER_TX',
          eur_usd_rate: eurUsdRate,
          reason: 'topup_order',
          notes: `Insufficient HBD balance at ${new Date().toISOString()}`
        }
      });

      console.log(`📝 [DEBT] Recorded ${requiredHbd} HBD debt to restaurant`);

      restaurantTxId = await transferEuroTokens('indies.cafe', orderCost, orderMemo);
      console.log(`[TOPUP] EURO transfer successful: ${restaurantTxId}`);
    }
  }

  // If email provided, update database with topup record
  if (customerEmail) {
    try {
      const existingUser = await findInnoUserByEmail(customerEmail);
      if (existingUser) {
        await createTopupForExistingUser(existingUser.id, amountEuro);
        console.log(`[TOPUP] Topup record created for user ID: ${existingUser.id}`);
      } else {
        console.warn(`[TOPUP] Email ${customerEmail} not found in database. Top-up completed but not tracked.`);
      }
    } catch (dbError) {
      console.error('[TOPUP] WARNING: Database update failed, but transfers succeeded:', dbError);
      // Don't throw - the payment went through, just log the DB issue
    }
  }

  return NextResponse.json({
    message: 'Top-up completed successfully',
    accountName,
    amountEuro,
    userCredit,
    userTxId,
    restaurantTxId,
    orderProcessed: !!restaurantTxId
  }, { status: 200 });
}

// ========================================
// ACCOUNT CREATION FLOW HANDLER
// ========================================
async function handleAccountCreation(session: Stripe.Checkout.Session) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WEBHOOK ACCOUNT] ========================================`);
  console.log(`[${timestamp}] [WEBHOOK ACCOUNT] Processing account creation: ${session.id}`);
  console.log(`[${timestamp}] [WEBHOOK ACCOUNT] Full metadata:`, JSON.stringify(session.metadata, null, 2));

  const { accountName, orderAmountEuro, orderMemo } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;
  const customerEmail = session.customer_details?.email;
  const orderCost = orderAmountEuro ? parseFloat(orderAmountEuro) : 0;

  console.log(`[${timestamp}] [WEBHOOK ACCOUNT] Extracted order info:`, {
    accountName,
    orderAmountEuro,
    orderMemo,
    orderMemoLength: orderMemo?.length,
    orderCost
  });

  if (!orderMemo && orderCost > 0) {
    console.error(`[${timestamp}] [WEBHOOK ACCOUNT] ⚠️ CRITICAL: Order cost ${orderCost} but NO MEMO! Transfer will fail to match order!`);
  }

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

  // STEP 1: Handle innouser table (if email provided) to get userId first
  let userId: number | null = null;
  if (customerEmail) {
    // Check if user with this email already exists
    const existingUser = await findInnoUserByEmail(customerEmail);

    if (existingUser) {
      // User already exists - create topup and update account link
      console.log(`[ACCOUNT] Email ${customerEmail} already exists (user ID: ${existingUser.id}), creating topup and updating account link`);
      await createTopupForExistingUser(existingUser.id, amountEuro);
      userId = existingUser.id;
      console.log(`[ACCOUNT] Topup created for existing user ID: ${userId}`);

      // Update or create bip39seedandaccount link to new account
      if (existingUser.bip39seedandaccount) {
        // Update existing link to point to new account
        await prisma.bip39seedandaccount.update({
          where: { userId: existingUser.id },
          data: {
            seed,
            accountName,
            hivetxid: hiveTxId,
          },
        });
        console.log(`[ACCOUNT] Updated bip39seedandaccount link to new account: ${accountName}`);
      } else {
        // Create new link (user exists but had no account linked before)
        await prisma.bip39seedandaccount.create({
          data: {
            userId: existingUser.id,
            seed,
            accountName,
            hivetxid: hiveTxId,
          },
        });
        console.log(`[ACCOUNT] Created new bip39seedandaccount link: ${accountName}`);
      }
    } else {
      // New user - create innouser with topup and account link
      console.log(`[ACCOUNT] Creating new innouser for ${customerEmail}`);
      const createdRecords = await createNewInnoUserWithTopupAndAccount(
        customerEmail,
        amountEuro,
        seed,
        accountName,
        hiveTxId
      );
      userId = createdRecords[0].id;
      console.log(`[ACCOUNT] Database records created for user ID: ${userId}`);
    }
  } else {
    console.warn('[ACCOUNT] No email provided, account created but not linked to innouser');
  }

  // STEP 2: Save to walletuser table with seed, masterPassword, and userId
  console.log(`[ACCOUNT] Saving to walletuser table with userId: ${userId || 'none'}`);
  const walletUser = await createWalletUser(accountName, hiveTxId, seed, keychain.masterPassword, userId);
  const walletUserId = walletUser?.id || null;
  console.log(`[ACCOUNT] Walletuser record created with ID: ${walletUserId}, linked to user ID: ${userId || 'none'}`);


  // Check for campaign eligibility and calculate bonus
  let bonusAmount = 0;
  const campaign = await getActiveCampaign();

  if (campaign) {
    const bonusCount = await getBonusCountForCampaign(campaign.id);
    console.log(`[ACCOUNT] Campaign ${campaign.id}: count50=${bonusCount.count50}, count100=${bonusCount.count100}`);

    if (amountEuro >= parseFloat(campaign.minAmount100.toString()) && bonusCount.count100 < campaign.maxUsers100) {
      bonusAmount = parseFloat(campaign.bonus100.toString());
      await createBonus(campaign.id, userId, walletUserId, accountName, bonusAmount);
      console.log(`[ACCOUNT] Applied 100 EUR tier bonus: ${bonusAmount} EURO`);
    } else if (amountEuro >= parseFloat(campaign.minAmount50.toString()) && bonusCount.count50 < campaign.maxUsers50) {
      bonusAmount = parseFloat(campaign.bonus50.toString());
      await createBonus(campaign.id, userId, walletUserId, accountName, bonusAmount);
      console.log(`[ACCOUNT] Applied 50 EUR tier bonus: ${bonusAmount} EURO`);
    }
  }

  // Calculate user balance (loaded amount + bonus - order cost)
  const totalEuro = amountEuro + bonusAmount - orderCost;
  console.log(`[ACCOUNT] User balance: ${totalEuro} EURO (${amountEuro} loaded + ${bonusAmount} bonus - ${orderCost} order)`);

  // Store credentials for temporary retrieval (expires in 5 minutes)
  // Must be done after totalEuro is calculated to include the balance
  const credentialSession = await prisma.accountCredentialSession.create({
    data: {
      accountName,
      stripeSessionId: session.id,
      masterPassword: keychain.masterPassword,
      ownerPrivate: keychain.owner.privateKey,
      ownerPublic: keychain.owner.publicKey,
      activePrivate: keychain.active.privateKey,
      activePublic: keychain.active.publicKey,
      postingPrivate: keychain.posting.privateKey,
      postingPublic: keychain.posting.publicKey,
      memoPrivate: keychain.memo.privateKey,
      memoPublic: keychain.memo.publicKey,
      euroBalance: totalEuro,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });
  console.log(`[ACCOUNT] Credential session created: ${credentialSession.id} with balance ${totalEuro} EURO`);

  // Transfer EURO tokens to user (for display purposes, like casino chips)
  const euroTxId = await transferEuroTokens(accountName, totalEuro, 'Account balance');
  console.log(`[ACCOUNT] EURO tokens transferred to user: ${euroTxId}`);

  // Transfer HBD to user (real value that user paid for)
  let userHbdTxId: string | undefined;
  if (totalEuro > 0) {
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const hbdAmount = convertEurToHbd(totalEuro, eurUsdRate);

    try {
      userHbdTxId = await transferHbd(accountName, hbdAmount, 'Account balance');
      console.log(`[ACCOUNT] Transferred ${hbdAmount} HBD to user (rate: ${eurUsdRate}): ${userHbdTxId}`);
    } catch (hbdError: any) {
      console.warn(`[ACCOUNT] ⚠️ Failed to transfer HBD to user, recording debt:`, hbdError.message);

      // Record debt - innopay owes HBD to customer
      await prisma.outstanding_debt.create({
        data: {
          creditor: accountName,
          amount_hbd: hbdAmount,
          euro_tx_id: euroTxId,
          eur_usd_rate: eurUsdRate,
          reason: 'account_creation_bonus',
          notes: `HBD shortage at ${new Date().toISOString()} - ${hbdError.message}`
        }
      });

      console.log(`📝 [DEBT] Recorded ${hbdAmount} HBD debt to customer ${accountName}`);
      // No EURO fallback here - user already has EURO tokens from line 520
    }
  }

  // Handle restaurant payment if coming from indiesmenu order
  let restaurantHbdTxId: string | undefined;
  let restaurantEuroTxId: string | undefined;

  if (orderCost > 0 && orderMemo) {
    const restaurantTimestamp = new Date().toISOString();
    console.log(`[${restaurantTimestamp}] [WEBHOOK ACCOUNT] ========================================`);
    console.log(`[${restaurantTimestamp}] [WEBHOOK ACCOUNT] Processing restaurant order payment`);
    console.log(`[${restaurantTimestamp}] [WEBHOOK ACCOUNT] Order details:`, {
      orderCost,
      orderMemo,
      orderMemoLength: orderMemo.length,
      recipient: 'indies.cafe'
    });

    try {
      // Fetch current EUR/USD rate
      const rateData = await getEurUsdRateServerSide();
      const eurUsdRate = rateData.conversion_rate;
      const hbdAmountForOrder = convertEurToHbd(orderCost, eurUsdRate);

      console.log(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] Calculated HBD amount: ${hbdAmountForOrder} (rate: ${eurUsdRate})`);

      // Try HBD transfer first (preferred) - from innopay to restaurant
      try {
        console.log(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] 🔄 Attempting HBD transfer to indies.cafe with memo:`, orderMemo);
        restaurantHbdTxId = await transferHbd('indies.cafe', hbdAmountForOrder, orderMemo);
        console.log(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] ✅ HBD transferred to restaurant: ${restaurantHbdTxId}`);
      } catch (hbdError: any) {
        // Fallback to EURO tokens if HBD insufficient - from innopay to restaurant
        console.warn(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] ⚠️ HBD transfer failed, using EURO token fallback:`, hbdError.message);

        // Record debt - innopay owes HBD to restaurant
        await prisma.outstanding_debt.create({
          data: {
            creditor: getRecipientForEnvironment('indies.cafe'),
            amount_hbd: hbdAmountForOrder,
            euro_tx_id: euroTxId,
            eur_usd_rate: eurUsdRate,
            reason: 'account_creation_order',
            notes: `HBD shortage at ${new Date().toISOString()} - Paid with EURO instead`
          }
        });

        console.log(`📝 [DEBT] Recorded ${hbdAmountForOrder} HBD debt to restaurant`);

        console.log(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] 🔄 Attempting EURO token transfer with memo:`, orderMemo);
        restaurantEuroTxId = await transferEuroTokens('indies.cafe', orderCost, orderMemo);
        console.log(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] ✅ EURO tokens transferred to restaurant: ${restaurantEuroTxId}`);
      }
    } catch (transferError) {
      console.error(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] ❌ Restaurant payment failed:`, transferError);
      // Account is created, but order payment failed - log for manual reconciliation
      // Don't throw error - account creation was successful
    }
  } else if (orderCost > 0 && !orderMemo) {
    console.error(`[${new Date().toISOString()}] [WEBHOOK ACCOUNT] ❌ CRITICAL ERROR: Order cost ${orderCost} EUR but NO MEMO! Skipping restaurant transfer to prevent order mismatch!`);
  }

  return NextResponse.json({
    message: 'Account created successfully',
    accountName,
    hiveTxId,
    euroTxId,
    userHbdTxId,
    bonusAmount,
    restaurantHbdTxId,
    restaurantEuroTxId,
    credentialToken: credentialSession.id,
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
