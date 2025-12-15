// app/api/webhooks/route.ts - Updated to support systematic flow management
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Import flow management system
import { FLOW_METADATA, type Flow } from '@/lib/flows';

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
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] [WEBHOOK] ========================================`);
    console.log(`[${timestamp}] [WEBHOOK] Processing checkout session: ${session.id}`);
    console.log(`[${timestamp}] [WEBHOOK] Full metadata:`, session.metadata);

    const flow = session.metadata?.flow as Flow | undefined;
    const flowCategory = session.metadata?.flowCategory;

    if (flow && FLOW_METADATA[flow]) {
      const flowMetadata = FLOW_METADATA[flow];
      console.log(`[${timestamp}] [WEBHOOK] Detected flow: ${flow}`);
      console.log(`[${timestamp}] [WEBHOOK] Flow category: ${flowMetadata.category}`);
      console.log(`[${timestamp}] [WEBHOOK] Flow description: ${flowMetadata.description}`);
      console.log(`[${timestamp}] [WEBHOOK] Requires redirect: ${flowMetadata.requiresRedirect} → ${flowMetadata.redirectTarget || 'none'}`);
    } else {
      console.warn(`[${timestamp}] [WEBHOOK] No flow metadata found, using legacy detection`);
    }

    try {
      // Route to appropriate handler based on flow
      if (flow === 'guest_checkout') {
        // === GUEST CHECKOUT FLOW ===
        return await handleGuestCheckout(session);
      } else if (flow === 'new_account' || flow === 'create_account_only' || flow === 'create_account_and_pay') {
        // === ACCOUNT CREATION FLOWS ===
        return await handleAccountCreation(session);
      } else if (flow === 'topup' || flow === 'pay_with_account' || flow === 'pay_with_topup') {
        // === TOP-UP / PAYMENT FLOWS ===
        return await handleTopup(session);
      } else if (flow === 'import_account') {
        // === IMPORT ACCOUNT FLOW ===
        console.error(`[${timestamp}] [WEBHOOK] Import account flow not yet implemented`);
        throw new Error('Import account flow not yet implemented');
      } else {
        // === LEGACY FLOW (backward compatibility) ===
        console.log(`[${timestamp}] [WEBHOOK] Using legacy flow handler`);
        return await handleLegacyFlow(session);
      }
    } catch (error: any) {
      console.error(`[${timestamp}] [WEBHOOK] Error processing checkout session ${session.id}:`, error);
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

        // Try to record debt - innopay owes HBD to restaurant (non-blocking)
        try {
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
        } catch (debtError) {
          console.error('[GUEST] WARNING: Failed to record debt, but EURO transfer succeeded:', debtError);
          // Don't throw - the payment went through, just log the debt recording issue
        }

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

  const { accountName, orderAmountEuro, orderMemo, table } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;
  const customerEmail = session.customer_details?.email;
  const orderCost = orderAmountEuro ? parseFloat(orderAmountEuro) : 0;
  const isFlow7 = orderCost > 0 && orderMemo;

  console.log(`[${timestamp}] [WEBHOOK TOPUP] Top-up info:`, {
    accountName,
    amountEuro,
    orderCost,
    customerEmail,
    hasOrderMemo: !!orderMemo,
    isFlow7,
    table
  });

  // Idempotency check: Check if we've recently processed a top-up with same amount for this account
  // This prevents duplicate webhook processing
  const walletUser = await prisma.walletuser.findUnique({
    where: { accountName }
  });

  if (walletUser && walletUser.userId) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentTopup = await prisma.topup.findFirst({
      where: {
        userId: walletUser.userId,
        amountEuro: amountEuro,
        topupAt: { gte: twoMinutesAgo }
      },
      orderBy: { topupAt: 'desc' }
    });

    if (recentTopup) {
      console.log(`[TOPUP] Recent identical top-up found (${amountEuro} EUR at ${recentTopup.topupAt}), returning success (idempotency)`);
      return NextResponse.json({
        message: 'Duplicate top-up detected',
        accountName,
        amountEuro
      }, { status: 200 });
    }
  }

  // Validate metadata
  if (!accountName) {
    throw new Error('Missing accountName in session metadata');
  }

  // Validate minimum amount (15 EUR for top-ups)
  if (amountEuro < 15) {
    throw new Error(`Amount ${amountEuro} EUR is below minimum of 15 EUR for top-up`);
  }

  // Skip account verification for topup flows (Flow 7, Flow 5 Branch B)
  // These accounts already exist in innopay localStorage
  // Note: Mock accounts are handled separately in dev/test and would need mocking
  console.log(`[TOPUP] Skipping account verification for ${accountName} (topup flow assumes account exists)`);

  if (accountName.startsWith('mock')) {
    console.log(`[TOPUP] ⚠️ Mock account detected - transfers will need to be mocked in future`);
  }

  // BRANCH: FLOW 7 vs FLOW 2
  if (isFlow7) {
    // ===== FLOW 7: TOPUP + ORDER PAYMENT (NEW UNIFIED APPROACH) =====
    console.log(`[FLOW 7] Detected Flow 7 - unified webhook approach`);
    return await handleFlow7UnifiedApproach(
      session,
      accountName,
      amountEuro,
      orderCost,
      orderMemo!,
      customerEmail,
      table,
      walletUser
    );
  } else {
    // ===== FLOW 2: PURE TOPUP (EXISTING LOGIC) =====
    console.log(`[FLOW 2] Pure topup - no pending order`);
    return await handleFlow2PureTopup(
      session,
      accountName,
      amountEuro,
      customerEmail,
      walletUser
    );
  }
}

// ========================================
// FLOW 7: UNIFIED TOPUP + ORDER PAYMENT
// ========================================
async function handleFlow7UnifiedApproach(
  session: Stripe.Checkout.Session,
  accountName: string,
  topupAmount: number,
  orderCost: number,
  orderMemo: string,
  customerEmail: string | null | undefined,
  table: string | undefined,
  walletUser: any
) {
  console.log(`[FLOW 7] ========================================`);
  console.log(`[FLOW 7] Unified approach: topup=${topupAmount}€, order=${orderCost}€`);

  // STEP 1: Execute order payment from innopay → restaurant using innopay authority
  console.log(`[FLOW 7] Step 1: Execute order payment from innopay → restaurant`);

  let restaurantEuroTxId: string | undefined;
  let restaurantHbdTxId: string | undefined;

  try {
    // Fetch EUR/USD rate for HBD conversion
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const hbdAmountForOrder = convertEurToHbd(orderCost, eurUsdRate);

    console.log(`[FLOW 7] Calculated HBD amount for order: ${hbdAmountForOrder} (rate: ${eurUsdRate})`);

    // Try HBD transfer first (preferred) - from innopay to restaurant
    try {
      console.log(`[FLOW 7] Attempting HBD transfer to indies.cafe with memo:`, orderMemo);
      restaurantHbdTxId = await transferHbd('indies.cafe', hbdAmountForOrder, orderMemo);
      console.log(`[FLOW 7] ✅ HBD transferred to restaurant: ${restaurantHbdTxId}`);
    } catch (hbdError: any) {
      // Fallback to EURO tokens if HBD insufficient
      console.warn(`[FLOW 7] ⚠️ HBD transfer failed, using EURO token fallback:`, hbdError.message);

      // Try to record debt - innopay owes HBD to restaurant (non-blocking)
      try {
        await prisma.outstanding_debt.create({
          data: {
            creditor: getRecipientForEnvironment('indies.cafe'),
            amount_hbd: hbdAmountForOrder,
            euro_tx_id: 'FLOW7_ORDER',
            eur_usd_rate: eurUsdRate,
            reason: 'flow7_order',
            notes: `Flow 7 order payment - HBD shortage at ${new Date().toISOString()}`
          }
        });
        console.log(`📝 [DEBT] Recorded ${hbdAmountForOrder} HBD debt to restaurant`);
      } catch (debtError) {
        console.error('[FLOW 7] WARNING: Failed to record debt:', debtError);
      }

      console.log(`[FLOW 7] Attempting EURO token transfer with memo:`, orderMemo);
      restaurantEuroTxId = await transferEuroTokens('indies.cafe', orderCost, orderMemo);
      console.log(`[FLOW 7] ✅ EURO tokens transferred to restaurant: ${restaurantEuroTxId}`);
    }
  } catch (orderError: any) {
    console.error(`[FLOW 7] ❌ Restaurant payment failed:`, orderError);
    throw new Error(`Flow 7 order payment failed: ${orderError.message}`);
  }

  // STEP 2: Calculate change (topup - order)
  const change = topupAmount - orderCost;
  console.log(`[FLOW 7] Step 2: Calculate change: ${topupAmount}€ - ${orderCost}€ = ${change}€`);

  // STEP 3: Handle change transfer
  let changeTxId: string | undefined;
  let changeHbdTxId: string | undefined;
  let userBalance = 0;

  if (change > 0) {
    // Positive change: innopay owes customer → transfer change to customer
    console.log(`[FLOW 7] Step 3: Positive change - transferring ${change}€ to ${accountName}`);

    const changeMemo = 'Monnaie / Change';
    changeTxId = await transferEuroTokens(accountName, change, changeMemo);
    console.log(`[FLOW 7] ✅ Change EURO transferred to customer: ${changeTxId}`);

    // Also try to transfer HBD change
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const hbdChange = convertEurToHbd(change, eurUsdRate);

    try {
      changeHbdTxId = await transferHbd(accountName, hbdChange, changeMemo);
      console.log(`[FLOW 7] ✅ Change HBD transferred to customer: ${changeHbdTxId}`);
    } catch (hbdError: any) {
      console.warn(`[FLOW 7] ⚠️ HBD change transfer failed, recording debt:`, hbdError.message);

      try {
        await prisma.outstanding_debt.create({
          data: {
            creditor: accountName,
            amount_hbd: hbdChange,
            euro_tx_id: changeTxId,
            eur_usd_rate: eurUsdRate,
            reason: 'flow7_change',
            notes: `Flow 7 change - HBD shortage at ${new Date().toISOString()}`
          }
        });
        console.log(`📝 [DEBT] Recorded ${hbdChange} HBD debt to customer`);
      } catch (debtError) {
        console.error('[FLOW 7] WARNING: Failed to record change debt:', debtError);
      }
    }

    userBalance = change;

  } else if (change < 0) {
    // Negative change: customer owes innopay → transfer deficit from customer to innopay
    const deficit = Math.abs(change);
    console.log(`[FLOW 7] Step 3: Negative change - transferring ${deficit}€ from ${accountName} to innopay`);

    // Use transferEuroTokensFromAccount which signs with innopay authority
    const deficitMemo = 'Paiement manquant / Missing payment';

    try {
      changeTxId = await transferEuroTokensFromAccount(accountName, 'innopay', deficit, deficitMemo);
      console.log(`[FLOW 7] ✅ Deficit EURO transferred from customer to innopay: ${changeTxId}`);
    } catch (deficitError: any) {
      console.error(`[FLOW 7] ❌ Deficit transfer failed:`, deficitError.message);
      // Don't throw - order was already paid to restaurant, this is just reconciliation
      console.warn(`[FLOW 7] ⚠️ Customer owes innopay ${deficit}€ but transfer failed - manual reconciliation needed`);
    }

    userBalance = 0; // Customer spent all their topup + some existing balance

  } else {
    // Zero change: exact match
    console.log(`[FLOW 7] Step 3: Exact match - no change transfer needed`);
    userBalance = 0;
  }

  // STEP 4: Update database with topup record
  if (customerEmail && walletUser) {
    try {
      if (!walletUser.userId) {
        console.error(`[FLOW 7] ⚠️ CRITICAL: walletuser.userId is NULL for accountName '${accountName}'!`);

        const existingUser = await findInnoUserByEmail(customerEmail);
        if (existingUser) {
          await prisma.walletuser.update({
            where: { id: walletUser.id },
            data: { userId: existingUser.id }
          });
          console.warn(`[FLOW 7] ✅ Updated walletuser.userId to ${existingUser.id}`);
          await createTopupForExistingUser(existingUser.id, topupAmount);
          console.warn(`[FLOW 7] ✅ Topup record created for user ID: ${existingUser.id}`);
        }
      } else {
        const existingUser = await findInnoUserByEmail(customerEmail);
        if (existingUser) {
          await createTopupForExistingUser(existingUser.id, topupAmount);
          console.warn(`[FLOW 7] ✅ Topup record created for user ID: ${existingUser.id}`);
        }
      }
    } catch (dbError) {
      console.error('[FLOW 7] ❌ Database update failed, but transfers succeeded:', dbError);
    }
  }

  // STEP 5: Create credential session with updated balance
  console.log(`[FLOW 7] Step 5: Creating credential session with balance: ${userBalance}€`);

  // Retrieve account keys from seed (same as account creation flow)
  const { getSeed, generateHiveKeys } = await import('@/services/hive');
  const seed = walletUser?.seed || getSeed(accountName);
  const keychain = generateHiveKeys(accountName, seed);

  const credentialSession = await prisma.accountCredentialSession.create({
    data: {
      accountName,
      stripeSessionId: session.id,
      masterPassword: walletUser?.masterPassword || keychain.masterPassword,
      ownerPrivate: keychain.owner.privateKey,
      ownerPublic: keychain.owner.publicKey,
      activePrivate: keychain.active.privateKey,
      activePublic: keychain.active.publicKey,
      postingPrivate: keychain.posting.privateKey,
      postingPublic: keychain.posting.publicKey,
      memoPrivate: keychain.memo.privateKey,
      memoPublic: keychain.memo.publicKey,
      euroBalance: userBalance,
      email: customerEmail || null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });
  console.log(`[FLOW 7] Credential session created: ${credentialSession.id}`);

  // STEP 6: Return success with redirect info
  const { getRestaurantUrl } = await import('@/services/utils');
  const restaurantUrl = getRestaurantUrl('indies', '/menu');

  const redirectUrl = new URL(restaurantUrl);
  redirectUrl.searchParams.set('order_success', 'true');
  redirectUrl.searchParams.set('credential_token', credentialSession.id);
  if (table) redirectUrl.searchParams.set('table', table);

  console.log(`[FLOW 7] ✅ Flow 7 complete - redirect to: ${redirectUrl.toString()}`);

  return NextResponse.json({
    message: 'Flow 7 completed successfully - topup + order payment unified',
    accountName,
    topupAmount,
    orderCost,
    change,
    userBalance,
    restaurantHbdTxId,
    restaurantEuroTxId,
    changeTxId,
    changeHbdTxId,
    credentialToken: credentialSession.id,
    redirectUrl: redirectUrl.toString()
  }, { status: 200 });
}

// ========================================
// FLOW 2: PURE TOPUP (NO ORDER)
// ========================================
async function handleFlow2PureTopup(
  session: Stripe.Checkout.Session,
  accountName: string,
  amountEuro: number,
  customerEmail: string | null | undefined,
  walletUser: any
) {
  const topupMemo = 'Solde mis à jour! / Balance updated!';

  let userTxId: string | undefined;
  let userHbdTxId: string | undefined;

  // Transfer entire topup amount to customer
  if (amountEuro > 0) {
    console.warn(`[FLOW 2] Transferring ${amountEuro} EURO tokens to ${accountName} with memo: ${topupMemo}`);
    userTxId = await transferEuroTokens(accountName, amountEuro, topupMemo);
    console.warn(`[FLOW 2] ✅ EURO transferred: ${userTxId}`);

    // CRITICAL: Also transfer HBD to user
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const requiredHbd = amountEuro * eurUsdRate;

    // Check innopay HBD balance
    const Client = (await import('@hiveio/dhive')).Client;
    const client = new Client([
      'https://api.hive.blog',
      'https://api.deathwing.me',
      'https://hive-api.arcange.eu'
    ]);

    const accounts = await client.database.getAccounts(['innopay']);
    if (!accounts || accounts.length === 0) {
      console.error('[FLOW 2] ❌ CRITICAL: Innopay account not found');
      throw new Error('Innopay account not found');
    }

    const hbdBalanceStr = typeof accounts[0].hbd_balance === 'string'
      ? accounts[0].hbd_balance
      : accounts[0].hbd_balance.toString();
    const hbdBalance = parseFloat(hbdBalanceStr.split(' ')[0]);

    console.warn(`[FLOW 2] Innopay HBD balance: ${hbdBalance}, Required for user: ${requiredHbd}`);

    if (hbdBalance >= requiredHbd) {
      // Transfer HBD to user
      console.warn(`[FLOW 2] Sufficient HBD, transferring ${requiredHbd} HBD to ${accountName}`);
      try {
        userHbdTxId = await transferHbd(accountName, requiredHbd, topupMemo);
        console.warn(`[FLOW 2] ✅ HBD transferred: ${userHbdTxId}`);
      } catch (hbdError: any) {
        console.error(`[FLOW 2] ❌ HBD transfer FAILED:`, hbdError.message);

        // Try to record debt - innopay owes HBD to user (non-blocking)
        try {
          await prisma.outstanding_debt.create({
            data: {
              creditor: accountName,
              amount_hbd: requiredHbd,
              euro_tx_id: userTxId || 'TOPUP',
              eur_usd_rate: eurUsdRate,
              reason: 'topup',
              notes: `HBD transfer failed at ${new Date().toISOString()} - ${hbdError.message}`
            }
          });
          console.warn(`📝 [DEBT] Recorded ${requiredHbd} HBD debt to ${accountName}`);
        } catch (debtError) {
          console.error('[FLOW 2] ❌ WARNING: Failed to record debt:', debtError);
        }
      }
    } else {
      // Insufficient HBD - user only gets EURO, record debt
      console.error(`[FLOW 2] ⚠️ Insufficient HBD (balance: ${hbdBalance}, needed: ${requiredHbd})`);

      // Try to record debt - innopay should pay HBD to user (non-blocking)
      try {
        await prisma.outstanding_debt.create({
          data: {
            creditor: accountName,
            amount_hbd: requiredHbd,
            euro_tx_id: userTxId || 'TOPUP',
            eur_usd_rate: eurUsdRate,
            reason: 'topup',
            notes: `Insufficient HBD balance at ${new Date().toISOString()}`
          }
        });
        console.warn(`📝 [DEBT] Recorded ${requiredHbd} HBD debt to ${accountName}`);
      } catch (debtError) {
        console.error('[FLOW 2] ❌ WARNING: Failed to record debt:', debtError);
      }
    }
  }

  // If email provided, update database with topup record
  if (customerEmail && walletUser) {
    console.warn(`[FLOW 2] Attempting to update database with email: ${customerEmail}`);
    try {
      if (!walletUser.userId) {
        console.error(`[FLOW 2] ⚠️ CRITICAL: walletuser.userId is NULL for accountName '${accountName}'!`);

        // Try to find innouser by email and create link
        const existingUser = await findInnoUserByEmail(customerEmail);
        if (existingUser) {
          console.warn(`[FLOW 2] Found innouser with email ${customerEmail}, userId: ${existingUser.id}`);

          // Update walletuser with userId
          await prisma.walletuser.update({
            where: { id: walletUser.id },
            data: { userId: existingUser.id }
          });
          console.warn(`[FLOW 2] ✅ Updated walletuser.userId to ${existingUser.id}`);

          // Now create topup record
          await createTopupForExistingUser(existingUser.id, amountEuro);
          console.warn(`[FLOW 2] ✅ Topup record created for user ID: ${existingUser.id}`);
        } else {
          console.error(`[FLOW 2] ❌ Email ${customerEmail} not found in innouser table. Cannot link walletuser.`);
          console.error(`[FLOW 2] Top-up completed but not tracked in database.`);
        }
      } else {
        // userId exists, proceed normally
        const existingUser = await findInnoUserByEmail(customerEmail);
        if (existingUser) {
          if (existingUser.id !== walletUser.userId) {
            console.warn(`[FLOW 2] ⚠️ Email mismatch: walletuser.userId=${walletUser.userId}, but email maps to userId=${existingUser.id}`);
            console.warn(`[FLOW 2] Updating email in innouser to ${customerEmail}`);
          }
          await createTopupForExistingUser(existingUser.id, amountEuro);
          console.warn(`[FLOW 2] ✅ Topup record created for user ID: ${existingUser.id}`);
        } else {
          console.error(`[FLOW 2] ❌ Email ${customerEmail} not found in database. Top-up completed but not tracked.`);
        }
      }
    } catch (dbError) {
      console.error('[FLOW 2] ❌ Database update failed, but transfers succeeded:', dbError);
      // Don't throw - the payment went through, just log the DB issue
    }
  } else {
    console.warn(`[FLOW 2] No customer email provided, skipping database update`);
  }

  return NextResponse.json({
    message: 'Top-up completed successfully (Flow 2)',
    accountName,
    amountEuro,
    euroTxId: userTxId,
    hbdTxId: userHbdTxId,
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

  const { accountName, orderAmountEuro, orderMemo, mockAccountCreation } = session.metadata!;
  const amountEuro = (session.amount_total || 0) / 100;
  const customerEmail = session.customer_details?.email;
  const orderCost = orderAmountEuro ? parseFloat(orderAmountEuro) : 0;
  const isMockMode = mockAccountCreation === 'true';

  console.log(`[${timestamp}] [WEBHOOK ACCOUNT] Extracted order info:`, {
    accountName,
    orderAmountEuro,
    orderMemo,
    orderMemoLength: orderMemo?.length,
    orderCost,
    mockMode: isMockMode
  });

  // MOCK MODE: Skip actual Hive account creation for dev/test
  if (isMockMode) {
    console.log(`[${timestamp}] [WEBHOOK ACCOUNT] 🎭 MOCK MODE ENABLED - Simulating account creation`);
    return await handleMockAccountCreation(session, accountName, amountEuro, customerEmail, orderCost, orderMemo);
  }

  if (!orderMemo && orderCost > 0) {
    console.error(`[${timestamp}] [WEBHOOK ACCOUNT] ⚠️ CRITICAL: Order cost ${orderCost} but NO MEMO! Transfer will fail to match order!`);
  }

  // Idempotency check: Have we already processed this session?
  const existingCredentialSession = await prisma.accountCredentialSession.findFirst({
    where: { stripeSessionId: session.id }
  });

  if (existingCredentialSession) {
    console.log(`[ACCOUNT] Session ${session.id} already processed (found credential session), returning success (idempotency)`);
    return NextResponse.json({
      message: 'Session already processed',
      accountName: existingCredentialSession.accountName
    }, { status: 200 });
  }

  // Validate metadata
  if (!accountName) {
    throw new Error('Missing accountName in session metadata');
  }

  // Validate minimum amount (TEMP: reduced for testing - was 30 EUR)
  if (amountEuro < 3) {
    throw new Error(`Amount ${amountEuro} EUR is below minimum of 3 EUR (TEMP: reduced for testing)`);
  }

  // Check if account already exists on Hive blockchain
  console.log(`[ACCOUNT] Checking if ${accountName} already exists on Hive...`);
  const exists = await accountExists(accountName);
  if (exists) {
    console.log(`[ACCOUNT] Account ${accountName} already exists on Hive, checking database linkage...`);

    // Check if the account is properly tracked in our database via bip39seedandaccount
    const accountLink = await prisma.bip39seedandaccount.findUnique({
      where: { accountName },
      include: {
        innouser: true
      }
    });

    if (accountLink && accountLink.innouser) {
      console.log(`[ACCOUNT] ✅ Account ${accountName} exists and is properly tracked in database`);
      console.log(`[ACCOUNT] innouser id: ${accountLink.innouser.id}, email: ${accountLink.innouser.email}`);
      console.log(`[ACCOUNT] bip39seedandaccount id: ${accountLink.id}`);
      console.log(`[ACCOUNT] This was likely a retry webhook after manual recovery. Returning success.`);

      return NextResponse.json({
        message: 'Account creation successful (already completed)',
        accountName,
        innouserId: accountLink.innouser.id,
        recovered: true
      }, { status: 200 });
    }

    // Account exists on Hive but not properly tracked in database
    console.error(`[ACCOUNT] ❌ Account ${accountName} exists on Hive but NOT properly tracked in database!`);
    console.error(`[ACCOUNT] This indicates a partial failure. Manual intervention required.`);
    throw new Error(`Account ${accountName} exists on Hive but not properly tracked in database`);
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
      email: customerEmail ? customerEmail : null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });
  console.log(`[ACCOUNT] Credential session created: ${credentialSession.id} with balance ${totalEuro} EURO${customerEmail ? ` and email ${customerEmail}` : ''}`);

  // Determine transfer memo based on flow (account creation vs top-up)
  const flow = session.metadata?.flow;
  const isAccountCreation = flow === 'new_account' || flow === 'create_account_only' || flow === 'create_account_and_pay';
  const transferMemo = isAccountCreation
    ? 'Bienvenue dans le système Innopay! / Welcome to Innopay!'
    : 'Solde mis à jour! / Balance updated!';

  console.log(`[ACCOUNT] Using transfer memo for flow '${flow}': ${transferMemo}`);

  // Transfer EURO tokens to user (for display purposes, like casino chips)
  const euroTxId = await transferEuroTokens(accountName, totalEuro, transferMemo);
  console.log(`[ACCOUNT] EURO tokens transferred to user: ${euroTxId}`);

  // Transfer HBD to user (real value that user paid for)
  let userHbdTxId: string | undefined;
  if (totalEuro > 0) {
    const rateData = await getEurUsdRateServerSide();
    const eurUsdRate = rateData.conversion_rate;
    const hbdAmount = convertEurToHbd(totalEuro, eurUsdRate);

    try {
      userHbdTxId = await transferHbd(accountName, hbdAmount, transferMemo);
      console.log(`[ACCOUNT] Transferred ${hbdAmount} HBD to user (rate: ${eurUsdRate}): ${userHbdTxId}`);
    } catch (hbdError: any) {
      console.warn(`[ACCOUNT] ⚠️ Failed to transfer HBD to user, recording debt:`, hbdError.message);

      // Try to record debt - innopay owes HBD to customer (non-blocking)
      try {
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
      } catch (debtError) {
        console.error('[ACCOUNT] WARNING: Failed to record debt:', debtError);
      }
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

        // Try to record debt - innopay owes HBD to restaurant (non-blocking)
        try {
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
        } catch (debtError) {
          console.error('[ACCOUNT] WARNING: Failed to record debt:', debtError);
        }

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
// MOCK ACCOUNT CREATION HANDLER (dev/test only)
// ========================================
async function handleMockAccountCreation(
  session: Stripe.Checkout.Session,
  accountName: string,
  amountEuro: number,
  customerEmail: string | null | undefined,
  orderCost: number,
  orderMemo?: string
) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [MOCK ACCOUNT] ========================================`);
  console.log(`[${timestamp}] [MOCK ACCOUNT] Creating MOCK account: ${accountName}`);
  console.log(`[${timestamp}] [MOCK ACCOUNT] Amount: ${amountEuro} EUR, Order: ${orderCost} EUR`);

  // Idempotency check
  const existingCredentialSession = await prisma.accountCredentialSession.findFirst({
    where: { stripeSessionId: session.id }
  });

  if (existingCredentialSession) {
    console.log(`[MOCK ACCOUNT] Session ${session.id} already processed, returning success (idempotency)`);
    return NextResponse.json({
      message: 'Session already processed (mock)',
      accountName: existingCredentialSession.accountName
    }, { status: 200 });
  }

  // Validate metadata
  if (!accountName) {
    throw new Error('Missing accountName in session metadata');
  }

  // Generate MOCK credentials (random strings that look real but don't work on blockchain)
  const mockSeed = `mock_seed_${accountName}_${Date.now()}`;
  const mockMasterPassword = `P5K${Math.random().toString(36).substring(2, 15).toUpperCase()}`;

  const mockKeychain = {
    masterPassword: mockMasterPassword,
    owner: {
      privateKey: `5K${Math.random().toString(36).substring(2, 50).toUpperCase()}`,
      publicKey: `STM${Math.random().toString(36).substring(2, 50).toUpperCase()}`
    },
    active: {
      privateKey: `5K${Math.random().toString(36).substring(2, 50).toUpperCase()}`,
      publicKey: `STM${Math.random().toString(36).substring(2, 50).toUpperCase()}`
    },
    posting: {
      privateKey: `5K${Math.random().toString(36).substring(2, 50).toUpperCase()}`,
      publicKey: `STM${Math.random().toString(36).substring(2, 50).toUpperCase()}`
    },
    memo: {
      privateKey: `5K${Math.random().toString(36).substring(2, 50).toUpperCase()}`,
      publicKey: `STM${Math.random().toString(36).substring(2, 50).toUpperCase()}`
    }
  };

  const mockHiveTxId = `mock_tx_${Date.now()}`;
  console.log(`[MOCK ACCOUNT] Generated mock credentials and tx ID: ${mockHiveTxId}`);

  // Calculate user balance (loaded amount - order cost, no bonus in mock mode)
  const totalEuro = amountEuro - orderCost;
  console.log(`[MOCK ACCOUNT] Mock balance: ${totalEuro} EURO (${amountEuro} loaded - ${orderCost} order, no bonus in mock mode)`);

  // Store mock credentials for temporary retrieval (expires in 5 minutes)
  const credentialSession = await prisma.accountCredentialSession.create({
    data: {
      accountName,
      stripeSessionId: session.id,
      masterPassword: mockKeychain.masterPassword,
      ownerPrivate: mockKeychain.owner.privateKey,
      ownerPublic: mockKeychain.owner.publicKey,
      activePrivate: mockKeychain.active.privateKey,
      activePublic: mockKeychain.active.publicKey,
      postingPrivate: mockKeychain.posting.privateKey,
      postingPublic: mockKeychain.posting.publicKey,
      memoPrivate: mockKeychain.memo.privateKey,
      memoPublic: mockKeychain.memo.publicKey,
      euroBalance: totalEuro,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });
  console.log(`[MOCK ACCOUNT] Credential session created: ${credentialSession.id} with balance ${totalEuro} EURO`);

  console.log(`[MOCK ACCOUNT] ✅ Mock account creation complete - NO blockchain transactions performed`);
  console.log(`[MOCK ACCOUNT] ⚠️ WARNING: This is a MOCK account. Credentials are fake and balance is simulated.`);
  console.log(`[MOCK ACCOUNT] ⚠️ Any transfer attempts with this account will FAIL.`);

  return NextResponse.json({
    message: 'Mock account created successfully (NO BLOCKCHAIN ACTIVITY)',
    accountName,
    hiveTxId: mockHiveTxId,
    credentialToken: credentialSession.id,
    mockMode: true,
    warning: 'This is a mock account. No actual blockchain account was created. Balance is simulated.'
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
      throw new Error('Minimum top-up is 3 EUR for new accounts (TEMP: reduced for testing)');
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
