// app/api/wallet-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@hiveio/dhive';
import { transferHbd, transferEuroTokens } from '@/services/hive';

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
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
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

    console.log('[WALLET PAYMENT] Final memo:', finalMemo);

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

    // Convert EUR to HBD using actual EUR/USD rate (HBD = USD)
    const requiredHbd = parseFloat(amountEuro) * parseFloat(eurUsdRate);

    console.log('[WALLET PAYMENT] Innopay HBD balance:', hbdBalance, 'Required:', requiredHbd);

    let transferTxId: string;

    if (hbdBalance >= requiredHbd) {
      // Transfer HBD from innopay to restaurant using utility function
      console.log('[WALLET PAYMENT] Sufficient HBD, transferring HBD...');
      transferTxId = await transferHbd(recipient, requiredHbd, finalMemo);
      console.log('[WALLET PAYMENT] HBD transfer successful! TX:', transferTxId);

    } else {
      // Transfer EURO tokens from innopay to restaurant using utility function
      console.log('[WALLET PAYMENT] Insufficient HBD, transferring EURO tokens...');
      transferTxId = await transferEuroTokens(recipient, parseFloat(amountEuro), finalMemo);
      console.log('[WALLET PAYMENT] EURO transfer successful! TX:', transferTxId);
    }

    const response = NextResponse.json({
      success: true,
      customerTxId,
      innopayTxId: transferTxId,
      recipient,
      distriateSuffix,
      transferType: hbdBalance >= requiredHbd ? 'HBD' : 'EURO'
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