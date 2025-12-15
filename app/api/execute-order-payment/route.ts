// app/api/execute-order-payment/route.ts
// Flow 5 Branch A: Execute order payment for existing account with sufficient balance

import { NextRequest, NextResponse } from 'next/server';
import { processOrderPayment } from '@/services/payment-processor';
import prisma from '@/lib/prisma';

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
    const { accountName, orderAmount, orderMemo, restaurantAccount, table } = body;

    // Validate required parameters
    if (!accountName || !orderAmount || !orderMemo || !restaurantAccount) {
      return NextResponse.json(
        { error: 'Missing required parameters: accountName, orderAmount, orderMemo, restaurantAccount' },
        { status: 400 }
      );
    }

    console.log(`[EXECUTE ORDER] Processing payment:`, {
      accountName,
      orderAmount,
      restaurantAccount,
      memoLength: orderMemo.length,
      table
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

    // STEP 4: Calculate new balance (current balance - order amount)
    // Note: We don't have exact balance here, client will update after transfer
    // For credential session, we'll use 0 as placeholder since balance is unknown
    const newBalance = 0; // Client will fetch real balance after redirect

    // STEP 5: Create credential session for return to indiesmenu
    const credentialSession = await prisma.accountCredentialSession.create({
      data: {
        accountName,
        stripeSessionId: `direct_payment_${Date.now()}`, // No Stripe session for direct payment
        masterPassword: walletUser.masterPassword || '',
        ownerPrivate: '',
        ownerPublic: '',
        activePrivate: '',
        activePublic: '',
        postingPrivate: '',
        postingPublic: '',
        memoPrivate: '',
        memoPublic: '',
        euroBalance: newBalance,
        email: null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    console.log(`[EXECUTE ORDER] Credential session created: ${credentialSession.id}`);

    // STEP 6: Build redirect URL for return to restaurant
    const { getRestaurantUrl } = await import('@/services/utils');
    const restaurantUrl = getRestaurantUrl('indies', '/menu');

    const redirectUrl = new URL(restaurantUrl);
    redirectUrl.searchParams.set('order_success', 'true');
    redirectUrl.searchParams.set('credential_token', credentialSession.id);
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
