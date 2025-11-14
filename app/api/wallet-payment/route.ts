// app/api/wallet-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey, Transaction } from '@hiveio/dhive';

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
      distriateSuffix
    });

    // Validate required fields
    if (!customerAccount || !customerTxId || !recipient || !amountEuro || !eurUsdRate || !orderMemo || !distriateSuffix) {
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
      // Transfer HBD from innopay to restaurant
      console.log('[WALLET PAYMENT] Sufficient HBD, transferring HBD...');

      const hbdAmount = requiredHbd.toFixed(3);

      const transferOperation = [
        'transfer',
        {
          from: innopayAccount,
          to: recipient,
          amount: `${hbdAmount} HBD`,
          memo: finalMemo
        }
      ];

      // Get current blockchain block details for transaction validity
      const dynamicGlobalProperties = await client.database.getDynamicGlobalProperties();
      const headBlockNumber = dynamicGlobalProperties.head_block_number;
      const headBlockId = dynamicGlobalProperties.head_block_id;
      const refBlockNum = headBlockNumber & 0xffff;
      const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
      const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

      const baseTransaction: Transaction = {
        ref_block_num: refBlockNum,
        ref_block_prefix: refBlockPrefix,
        expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
        operations: [transferOperation as any],
        extensions: [],
      };

      // Sign and broadcast the transaction
      const signedTransaction = client.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayActiveKey)]);
      const broadcastResult = await client.broadcast.send(signedTransaction);
      transferTxId = broadcastResult.id;

      console.log('[WALLET PAYMENT] HBD transfer successful! TX:', transferTxId);

    } else {
      // Transfer EURO tokens from innopay to restaurant
      console.log('[WALLET PAYMENT] Insufficient HBD, transferring EURO tokens...');

      const euroAmount = parseFloat(amountEuro).toFixed(2);

      const transferPayload = {
        contractName: 'tokens',
        contractAction: 'transfer',
        contractPayload: {
          symbol: 'EURO',
          to: recipient,
          quantity: euroAmount,
          memo: finalMemo,
        },
      };

      const transferOperation = [
        'custom_json',
        {
          required_auths: [innopayAccount],
          required_posting_auths: [],
          id: 'ssc-mainnet-hive',
          json: JSON.stringify(transferPayload),
        },
      ];

      // Get current blockchain block details for transaction validity
      const dynamicGlobalProperties = await client.database.getDynamicGlobalProperties();
      const headBlockNumber = dynamicGlobalProperties.head_block_number;
      const headBlockId = dynamicGlobalProperties.head_block_id;
      const refBlockNum = headBlockNumber & 0xffff;
      const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
      const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

      const baseTransaction: Transaction = {
        ref_block_num: refBlockNum,
        ref_block_prefix: refBlockPrefix,
        expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
        operations: [transferOperation as any],
        extensions: [],
      };

      // Sign and broadcast the transaction
      const signedTransaction = client.broadcast.sign(baseTransaction, [PrivateKey.fromString(innopayActiveKey)]);
      const broadcastResult = await client.broadcast.send(signedTransaction);
      transferTxId = broadcastResult.id;

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
