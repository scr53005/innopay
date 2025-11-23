// app/api/wallet-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey } from '@hiveio/dhive';
import { transferHbd, transferEuroTokens } from '@/services/hive';
import prisma from '@/lib/prisma';

const client = new Client([
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://hive-api.arcange.eu'
]);

/**
 * POST /api/wallet-payment
 * Handles payment from returning customer with EURO tokens
 *
 * Flow:
 * 1. Customer transfers EURO tokens to innopay (done client-side before calling this)
 * 2. This API receives payment details
 * 3. Transfers HBD (if available) or EURO tokens from innopay to restaurant
 * 4. Uses the SAME distriateSuffix for linking transactions
 *
 * Body:
 * - customerAccount: Customer's Hive account name
 * - customerTxId: Customer's EURO transfer transaction ID
 * - recipient: Restaurant's Hive account (e.g., 'indies.cafe')
 * - amountEuro: Order amount in EUR
 * - eurUsdRate: Current EUR/USD conversion rate
 * - orderMemo: Full order details
 * - distriateSuffix: The distriate suffix for linking
 */
export async function POST(req: NextRequest) {
  try {
    const { customerAccount, customerTxId, recipient, amountEuro, eurUsdRate, orderMemo, distriateSuffix } = await req.json();

    console.log('[WALLET PAYMENT] Received payment request:', {
      customerAccount,
      customerTxId,
      recipient,
      amountEuro,
      eurUsdRate,
      orderMemo,
      distriateSuffix
    });

    // Validate required fields
    if (!customerAccount || !customerTxId || !recipient || !amountEuro || !eurUsdRate || !orderMemo || !distriateSuffix) {
      const errorResponse = NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
      errorResponse.headers.set('Access-Control-Allow-Origin', '*');
      errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return errorResponse;
    }

    // Get innopay account name from environment?
    const innopayAccount = 'innopay'; // or process.env.HIVE_ACCOUNT to be more generic but I don't see the point;

    /* if (!innopayAccount) {
      console.error('[WALLET PAYMENT] Missing HIVE_ACCOUNT in environment');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    } */

    // Construct final memo: orderMemo + distriateSuffix
    const finalMemo = `${orderMemo} ${distriateSuffix}`;

    console.warn('[WALLET PAYMENT] Final memo:', finalMemo);

    // ========================================
    // STEP 1: Transfer HBD from customer to innopay
    // ========================================
    let customerHbdTransferred = 0;
    let customerHbdTxId: string | undefined;
    let requiredHbd = 0;

    try {
      requiredHbd = parseFloat(amountEuro) * parseFloat(eurUsdRate);
      console.warn(`[WALLET PAYMENT] Customer should transfer ${requiredHbd} HBD to innopay`);
    } catch (calcError: any) {
      console.error('[WALLET PAYMENT] ❌ Error calculating required HBD:', calcError.message);
      requiredHbd = 0; // Continue without HBD transfer
    }

    // Wrap ENTIRE customer HBD transfer logic to prevent blocking main flow
    try {
      try {
        // Check customer's liquid HBD balance
        const customerAccounts = await client.database.getAccounts([customerAccount]);
        if (!customerAccounts || customerAccounts.length === 0) {
          console.error(`[WALLET PAYMENT] ❌ Customer account ${customerAccount} not found`);
          throw new Error(`Customer account ${customerAccount} not found`);
        }

        const customerHbdStr = typeof customerAccounts[0].hbd_balance === 'string'
          ? customerAccounts[0].hbd_balance
          : customerAccounts[0].hbd_balance.toString();
        const customerLiquidHbd = parseFloat(customerHbdStr.split(' ')[0]);

        console.warn(`[WALLET PAYMENT] Customer ${customerAccount} has ${customerLiquidHbd} liquid HBD, needs ${requiredHbd} HBD`);

        if (customerLiquidHbd > 0) {
          // Transfer whatever HBD is available (up to required amount)
          const hbdToTransfer = Math.min(customerLiquidHbd, requiredHbd);
          console.warn(`[WALLET PAYMENT] Attempting to transfer ${hbdToTransfer} HBD from ${customerAccount} to innopay`);

          // Get innopay's active authority key to sign on behalf of customer
          const innopayActiveKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
          if (!innopayActiveKey) {
            throw new Error('HIVE_ACTIVE_KEY_INNOPAY not configured');
          }

          const privateKey = PrivateKey.fromString(innopayActiveKey);

          // Create transfer operation from customer to innopay
          const transferOp = [
            'transfer',
            {
              from: customerAccount,
              to: innopayAccount,
              amount: `${hbdToTransfer.toFixed(3)} HBD`,
              memo: `Order payment: ${amountEuro} EUR`
            }
          ];

          // Broadcast transaction
          const result = await client.broadcast.sendOperations([transferOp], privateKey);
          customerHbdTxId = result.id;
          customerHbdTransferred = hbdToTransfer;

          console.warn(`[WALLET PAYMENT] ✅ Customer HBD transfer successful: ${customerHbdTxId}`);
          console.warn(`[WALLET PAYMENT] Transferred ${customerHbdTransferred} HBD of ${requiredHbd} HBD required`);

        } else {
          console.warn(`[WALLET PAYMENT] ⚠️ Customer has 0 liquid HBD - cannot transfer any HBD`);
        }

      } catch (hbdError: any) {
        console.error(`[WALLET PAYMENT] ❌ Failed to transfer HBD from customer to innopay:`, hbdError.message);
        console.error(`[WALLET PAYMENT] This could be due to: insufficient balance, authority revoked, HBD in savings, or network error`);
        // Continue with EURO-only payment, will record debt below
      }

      // Record outstanding debt if customer couldn't transfer full HBD amount
      const hbdShortfall = requiredHbd - customerHbdTransferred;
      if (hbdShortfall > 0.001) { // Allow tiny rounding errors
        console.error(`[WALLET PAYMENT] ⚠️ Customer HBD shortfall: ${hbdShortfall} HBD`);
        console.warn(`[WALLET PAYMENT] Recording outstanding debt from ${customerAccount} to innopay`);

        try {
          await prisma.outstanding_debt.create({
            data: {
              creditor: innopayAccount,
              debtor: customerAccount,
              amount_hbd: hbdShortfall,
              euro_tx_id: customerTxId,
              eur_usd_rate: parseFloat(eurUsdRate),
              reason: 'customer_order_payment',
              notes: `Customer ${customerAccount} could not transfer ${hbdShortfall} HBD for order. Transferred ${customerHbdTransferred} HBD, shortfall ${hbdShortfall} HBD. EURO transfer: ${customerTxId}`
            }
          });
          console.warn(`[WALLET PAYMENT] 📝 Recorded ${hbdShortfall} HBD debt from ${customerAccount} to innopay`);
        } catch (debtError) {
          console.error('[WALLET PAYMENT] ❌ WARNING: Failed to record customer debt:', debtError);
          // Don't block payment, but log the issue
        }
      } else {
        console.warn(`[WALLET PAYMENT] ✅ Customer transferred full HBD amount (${customerHbdTransferred} HBD)`);
      }

    } catch (customerFlowError: any) {
      // CRITICAL: Catch ANY error in customer → innopay flow to ensure we continue to innopay → restaurant
      console.error('[WALLET PAYMENT] ❌ CRITICAL ERROR in customer → innopay flow:', customerFlowError.message);
      console.error('[WALLET PAYMENT] Stack:', customerFlowError.stack);
      console.error('[WALLET PAYMENT] Continuing to innopay → restaurant transfer despite error...');
      // customerHbdTransferred will remain 0, requiredHbd already set
    }

    console.warn('[WALLET PAYMENT] ========================================');
    console.warn('[WALLET PAYMENT] Proceeding to STEP 2: innopay → restaurant');
    console.warn('[WALLET PAYMENT] ========================================');

    // Check innopay HBD balance
    const accounts = await client.database.getAccounts([innopayAccount]);
    if (!accounts || accounts.length === 0) {
      throw new Error('Innopay account not found');
    }

    // Handle hbd_balance which can be either string or Asset type
    const hbdBalanceStr = typeof accounts[0].hbd_balance === 'string'
      ? accounts[0].hbd_balance
      : accounts[0].hbd_balance.toString();
    const hbdBalance = parseFloat(hbdBalanceStr.split(' ')[0]);

    console.warn('[WALLET PAYMENT] Innopay HBD balance:', hbdBalance, 'Required:', requiredHbd);

    let transferTxId: string;

    // ========================================
    // STEP 2: Transfer from innopay to restaurant
    // ========================================
    if (hbdBalance >= requiredHbd) {
      // Transfer HBD from innopay to restaurant using utility function
      console.warn('[WALLET PAYMENT] Sufficient HBD in innopay, transferring HBD to restaurant...');
      transferTxId = await transferHbd(recipient, requiredHbd, finalMemo);
      console.warn('[WALLET PAYMENT] ✅ HBD transfer to restaurant successful! TX:', transferTxId);

    } else {
      // Transfer EURO tokens from innopay to restaurant using utility function
      console.error('[WALLET PAYMENT] ⚠️ Insufficient HBD in innopay, transferring EURO tokens to restaurant...');
      transferTxId = await transferEuroTokens(recipient, parseFloat(amountEuro), finalMemo);
      console.warn('[WALLET PAYMENT] ✅ EURO transfer to restaurant successful! TX:', transferTxId);
    }

    const response = NextResponse.json({
      success: true,
      customerEuroTxId: customerTxId,
      customerHbdTxId: customerHbdTxId,
      customerHbdTransferred: customerHbdTransferred,
      customerHbdRequired: requiredHbd,
      customerHbdShortfall: requiredHbd - customerHbdTransferred,
      innopayTxId: transferTxId,
      recipient,
      distriateSuffix,
      innopayTransferType: hbdBalance >= requiredHbd ? 'HBD' : 'EURO'
    }, { status: 200 });

    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

  } catch (error: any) {
    console.error('[WALLET PAYMENT] Error:', error);
    const errorResponse = NextResponse.json(
      {
        error: 'Payment processing failed',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );

    // Add CORS headers to error response too
    errorResponse.headers.set('Access-Control-Allow-Origin', '*');
    errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return errorResponse;
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  const response = NextResponse.json({}, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}