// app/api/sign-and-broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey, Transaction } from '@hiveio/dhive';

const client = new Client([
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://hive-api.arcange.eu'
], {
  timeout: 15000,
  failoverThreshold: 3
});

/**
 * POST /api/sign-and-broadcast
 * Signs and broadcasts a Hive operation server-side (has access to Node.js crypto)
 *
 * Body Option 1:
 * - operation: The Hive operation object (e.g., custom_json for EURO transfer)
 * - activePrivateKey: The active private key (WIF format)
 *
 * Body Option 2:
 * - operation: The Hive operation object
 * - masterPassword: The master password
 * - accountName: The account name (to derive key)
 *
 * Security: Private key/password transmitted over HTTPS, used immediately for signing,
 * and not stored. Used only for this one-time broadcast.
 */
export async function POST(req: NextRequest) {
  try {
    const { operation, activePrivateKey, masterPassword, accountName } = await req.json();

    console.log('[SIGN-API] Received sign request');

    // Validate required fields
    if (!operation) {
      const errorResponse = NextResponse.json(
        { error: 'Missing required field: operation' },
        { status: 400 }
      );
      errorResponse.headers.set('Access-Control-Allow-Origin', '*');
      errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return errorResponse;
    }

    if (!activePrivateKey && (!masterPassword || !accountName)) {
      const errorResponse = NextResponse.json(
        { error: 'Must provide either activePrivateKey OR (masterPassword + accountName)' },
        { status: 400 }
      );
      errorResponse.headers.set('Access-Control-Allow-Origin', '*');
      errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return errorResponse;
    }

    // Get or derive the private key
    let key: PrivateKey;
    if (activePrivateKey) {
      // Option 1: Use provided active key
      console.log('[SIGN-API] Using provided active key...');
      key = PrivateKey.fromString(activePrivateKey);
      console.log('[SIGN-API] Key parsed successfully');
    } else {
      // Option 2: Derive active key from master password
      console.log('[SIGN-API] Deriving active key from master password...');
      key = PrivateKey.fromSeed(`${accountName}active${masterPassword}`);
      console.log('[SIGN-API] Key derived successfully');
    }

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
      operations: [['custom_json', operation] as any],
      extensions: [],
    };

    // Sign and broadcast the transaction
    console.log('[SIGN-API] Signing and broadcasting operation...');
    const signedTransaction = client.broadcast.sign(baseTransaction, [key]);
    const broadcastResult = await client.broadcast.send(signedTransaction);

    console.log('[SIGN-API] Broadcast successful! TX:', broadcastResult.id);

    // Add CORS headers for cross-origin requests from indiesmenu
    const response = NextResponse.json({
      success: true,
      txId: broadcastResult.id
    }, { status: 200 });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

  } catch (error: any) {
    console.error('[SIGN-API] Error:', error);
    const errorResponse = NextResponse.json(
      {
        error: 'Signing/broadcasting failed',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );

    // Add CORS headers to error response
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
