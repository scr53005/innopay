// app/api/wallet-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey } from '@hiveio/dhive';

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
 * - orderMemo: Full order details
 * - distriateSuffix: The distriate suffix for linking
 */
export async function POST(req: NextRequest) {
  try {
    const { customerAccount, customerTxId, recipient, amountEuro, orderMemo, distriateSuffix } = await req.json();

    console.log('[WALLET PAYMENT] Received payment request:', {
      customerAccount,
      customerTxId,
      recipient,
      amountEuro,
      distriateSuffix
    });

    // Validate required fields
    if (!customerAccount || !customerTxId || !recipient || !amountEuro || !orderMemo || !distriateSuffix) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get innopay account credentials from environment
    const innopayAccount = process.env.HIVE_ACCOUNT;
    const innopayActiveKey = process.env.HIVE_ACTIVE_PRIVATE_KEY;

    if (!innopayAccount || !innopayActiveKey) {
      console.error('[WALLET PAYMENT] Missing innopay credentials in environment');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Construct final memo: orderMemo + distriateSuffix
    const finalMemo = `${orderMemo} ${distriateSuffix}`;

    console.log('[WALLET PAYMENT] Final memo:', finalMemo);

    // Check innopay HBD balance
    const accounts = await client.database.getAccounts([innopayAccount]);
    if (!accounts || accounts.length === 0) {
      throw new Error('Innopay account not found');
    }

    const hbdBalance = parseFloat(accounts[0].hbd_balance.split(' ')[0]);
    const requiredHbd = parseFloat(amountEuro) * 1.05; // Rough estimate, adjust based on EUR/USD rate

    console.log('[WALLET PAYMENT] Innopay HBD balance:', hbdBalance, 'Required:', requiredHbd);

    let transferTxId: string;

    if (hbdBalance >= requiredHbd) {
      // Transfer HBD from innopay to restaurant
      console.log('[WALLET PAYMENT] Sufficient HBD, transferring HBD...');

      const hbdAmount = requiredHbd.toFixed(3);

      const operation = [
        'transfer',
        {
          from: innopayAccount,
          to: recipient,
          amount: `${hbdAmount} HBD`,
          memo: finalMemo
        }
      ];

      const key = PrivateKey.fromString(innopayActiveKey);
      const result = await client.broadcast.sendOperations([operation], key);
      transferTxId = result.id;

      console.log('[WALLET PAYMENT] HBD transfer successful! TX:', transferTxId);

    } else {
      // Transfer EURO tokens from innopay to restaurant
      console.log('[WALLET PAYMENT] Insufficient HBD, transferring EURO tokens...');

      const euroAmount = parseFloat(amountEuro).toFixed(2);

      const customJsonOp = {
        required_auths: [],
        required_posting_auths: [innopayAccount],
        id: 'ssc-mainnet-hive',
        json: JSON.stringify({
          contractName: 'tokens',
          contractAction: 'transfer',
          contractPayload: {
            symbol: 'EURO',
            to: recipient,
            quantity: euroAmount,
            memo: finalMemo
          }
        })
      };

      const key = PrivateKey.fromString(innopayActiveKey);
      const result = await client.broadcast.sendOperations(
        [['custom_json', customJsonOp]],
        key
      );
      transferTxId = result.id;

      console.log('[WALLET PAYMENT] EURO transfer successful! TX:', transferTxId);
    }

    return NextResponse.json({
      success: true,
      customerTxId,
      innopayTxId: transferTxId,
      recipient,
      distriateSuffix,
      transferType: hbdBalance >= requiredHbd ? 'HBD' : 'EURO'
    }, { status: 200 });

  } catch (error: any) {
    console.error('[WALLET PAYMENT] Error:', error);
    return NextResponse.json(
      {
        error: 'Payment processing failed',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
