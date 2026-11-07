// app/api/execute-order-payment/route.ts
// Flow 5 Branch A: Execute order payment for existing account with sufficient balance

import { NextRequest, NextResponse, after } from 'next/server';
import { processOrderPayment } from '@/services/payment-processor';
import prisma from '@/lib/prisma';
import { Client, PrivateKey } from '@hiveio/dhive';
import { isOrderAuthFresh, verifyOrderAuth } from '@/lib/order-payment-auth';
import { isActiveSpokeAccount } from '@/lib/spoke-recipients';
import { rewardOrder } from '@/lib/rubis-distribute';
import { rubisOrderKey } from '@/lib/rubis';
import { fetchTokenBalance } from '@/lib/leg-receipt';
import { balanceAfterOrder } from '@/lib/order-balance';

const hiveClient = new Client(['https://api.hive.blog', 'https://api.deathwing.me', 'https://hive-api.arcange.eu']);

/**
 * POST /api/execute-order-payment
 *
 * For Flow 5 Branch A: User has existing innopay account with sufficient balance
 *
 * Flow:
 * 1. Verify account exists and has sufficient EURO balance
 * 2. Transfer EURO from customer → innopay
 * 3. Transfer HBD/EURO from innopay → restaurant (with order memo)
 * 4. Create credential session for return to indiesmenu
 *
 * Request body:
 * - accountName: Customer's Hive account name
 * - orderAmount: Order cost in EUR
 * - orderMemo: Encoded order details + table info
 * - restaurantAccount: Restaurant Hive account (e.g., 'indies.cafe')
 * - table: Table number (optional)
 */
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [EXECUTE ORDER] ========================================`);

  try {
    const body = await req.json();
    const { accountName, orderAmount, orderMemo, restaurantAccount, table, returnUrl, authTs, authNonce, authSignature } = body;

    // Validate required parameters
    if (!accountName || !orderAmount || !orderMemo || !restaurantAccount) {
      return NextResponse.json(
        { error: 'Missing required parameters: accountName, orderAmount, orderMemo, restaurantAccount' },
        { status: 400 }
      );
    }

    // ========================================
    // PROOF OF CONTROL (security fix 2026-11-02). The caller must have signed THIS order
    // with the account's active key; the signature is checked against the chain. Without
    // it anyone could name any wallet here, spend its EURO and receive its credential token.
    // ========================================
    const authFields = {
      accountName: String(accountName),
      restaurantAccount: String(restaurantAccount),
      orderAmount: Number(orderAmount),
      orderMemo: String(orderMemo),
      ts: Number(authTs),
      nonce: String(authNonce ?? ''),
    };
    if (!authSignature || !authFields.nonce || !Number.isFinite(authFields.orderAmount) || !isOrderAuthFresh(authFields.ts)) {
      return NextResponse.json({ error: 'Missing or expired payment authorization' }, { status: 401 });
    }
    try {
      // Single-use nonce (shared replay-guard table with the wallet hand-off, own namespace).
      await prisma.handoff_challenge.create({ data: { account: authFields.accountName, nonce: `order:${authFields.nonce}` } });
    } catch {
      return NextResponse.json({ error: 'Payment authorization already used' }, { status: 401 });
    }
    if (!(await isActiveSpokeAccount(authFields.restaurantAccount))) {
      return NextResponse.json({ error: 'Unknown restaurant account' }, { status: 403 });
    }
    const chainAccounts = await hiveClient.database.getAccounts([authFields.accountName]);
    const activeKeyAuths = (chainAccounts[0]?.active?.key_auths ?? []).map((ka) => String(ka[0]));
    if (!verifyOrderAuth(authFields, String(authSignature), activeKeyAuths)) {
      console.warn(`[EXECUTE ORDER] Refused: signature does not match active key of ${authFields.accountName}`);
      return NextResponse.json({ error: 'Payment authorization invalid' }, { status: 401 });
    }

    console.log(`[EXECUTE ORDER] Processing payment:`, {
      accountName,
      orderAmount,
      restaurantAccount,
      memoLength: orderMemo.length,
      table,
      returnUrl
    });

    // STEP 1: Verify account exists in walletuser table
    const walletUser = await prisma.walletuser.findUnique({
      where: { accountName }
    });

    if (!walletUser) {
      console.error(`[EXECUTE ORDER] Account ${accountName} not found in walletuser table`);
      return NextResponse.json(
        { error: `Account ${accountName} not found` },
        { status: 404 }
      );
    }

    console.log(`[EXECUTE ORDER] Account found: ${accountName} (walletuser ID: ${walletUser.id})`);

    // STEP 2: Get current EURO balance
    // Note: We rely on the client-side check for sufficient balance
    // The blockchain will reject if insufficient
    console.log(`[EXECUTE ORDER] Proceeding with payment (balance verification done client-side)`);

    // Read before paying: Hive-Engine shows the payment only seconds later (see order-balance.ts).
    const balanceBefore = await fetchTokenBalance(accountName, 'EURO');

    // STEP 3: Execute payment flow using shared payment processor
    const paymentResult = await processOrderPayment({
      customerAccount: accountName,
      restaurantAccount,
      orderAmount,
      orderMemo,
      fromCustomer: true, // Transfer from customer to innopay first
      reason: 'flow5_branch_a'
    });

    console.log(`[EXECUTE ORDER] Payment successful:`, {
      customerEuroTxId: paymentResult.customerEuroTxId,
      restaurantHbdTxId: paymentResult.restaurantHbdTxId,
      restaurantEuroTxId: paymentResult.restaurantEuroTxId,
      eurUsdRate: paymentResult.eurUsdRate
    });

    // RUBIS for the customer, after the response (RUBIS-PLAN.md) — never delays the order.
    after(() => rewardOrder({
      orderKey: rubisOrderKey(restaurantAccount, orderMemo, `direct:${paymentResult.customerEuroTxId ?? authFields.nonce}`),
      customerAccount: accountName, recipient: restaurantAccount, orderTotal: Number(orderAmount), memo: orderMemo,
    }));

    // STEP 4: Balance after the order. null = Hive-Engine was unreachable before paying: no
    // optimistic_balance in the redirect, and the spoke reads the chain instead.
    const newBalance = balanceAfterOrder(balanceBefore, Number(orderAmount), !!paymentResult.customerEuroTxId);

    // STEP 4.5: Derive ONLY active + memo for the spoke hand-over (spokes store exactly these
    // two — SPOKE-KEY-SECURITY.md §4). Security fix 2026-11-03: the master password, owner and
    // posting keys are no longer put in this session; the caller only proved the ACTIVE key,
    // so returning the owner-deriving secret would escalate a stolen active key to takeover.
    const masterPassword = walletUser.masterPassword || '';
    const activePrivate = PrivateKey.fromLogin(accountName, masterPassword, 'active');
    const memoPrivate = PrivateKey.fromLogin(accountName, masterPassword, 'memo');

    // STEP 5: Create credential session for return to indiesmenu
    const credentialSession = await prisma.accountCredentialSession.create({
      data: {
        accountName,
        stripeSessionId: `direct_payment_${Date.now()}`, // No Stripe session for direct payment
        activePrivate: activePrivate.toString(),
        activePublic: activePrivate.createPublic().toString(),
        memoPrivate: memoPrivate.toString(),
        memoPublic: memoPrivate.createPublic().toString(),
        // The column cannot be empty; when the balance is unknown the 0 here is never shown,
        // because spokes read the optimistic_balance URL param for this return (indies, 2026-11-07).
        euroBalance: newBalance ?? 0,
        email: null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    console.log(`[EXECUTE ORDER] Credential session created: ${credentialSession.id}`);

    // STEP 6: Build redirect URL for return to restaurant
    // Use returnUrl from request if provided (preserves environment), otherwise use getRestaurantUrl
    let baseRestaurantUrl: string;
    if (returnUrl) {
      baseRestaurantUrl = returnUrl;
      console.log(`[EXECUTE ORDER] Using provided return URL: ${returnUrl}`);
    } else {
      const { getRestaurantUrl } = await import('@/services/utils');
      baseRestaurantUrl = getRestaurantUrl('indies', '/menu');
      console.log(`[EXECUTE ORDER] Using getRestaurantUrl fallback: ${baseRestaurantUrl}`);
    }

    const redirectUrl = new URL(baseRestaurantUrl);
    redirectUrl.searchParams.set('order_success', 'true');
    redirectUrl.searchParams.set('existing_account', 'true'); // Trigger Flow 5 existing account handling
    redirectUrl.searchParams.set('credential_token', credentialSession.id);
    redirectUrl.searchParams.set('flow', '6'); // Indicate this was Flow 6 (pay with existing account)
    if (newBalance !== null) redirectUrl.searchParams.set('optimistic_balance', newBalance.toFixed(2));
    if (table) redirectUrl.searchParams.set('table', table);

    console.log(`[EXECUTE ORDER] ✅ Complete - redirect to: ${redirectUrl.toString()}`);

    return NextResponse.json({
      success: true,
      accountName,
      orderAmount,
      customerEuroTxId: paymentResult.customerEuroTxId,
      restaurantHbdTxId: paymentResult.restaurantHbdTxId,
      restaurantEuroTxId: paymentResult.restaurantEuroTxId,
      credentialToken: credentialSession.id,
      redirectUrl: redirectUrl.toString()
    }, { status: 200 });

  } catch (error: any) {
    console.error(`[EXECUTE ORDER] ❌ Error:`, error);
    return NextResponse.json(
      { error: 'Payment processing failed', message: error.message },
      { status: 500 }
    );
  }
}
