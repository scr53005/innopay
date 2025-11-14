// app/api/sign-and-broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey } from '@hiveio/dhive';

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
 * Body:
 * - operation: The Hive operation object (e.g., custom_json for EURO transfer)
 * - activePrivateKey: The active private key (WIF format)
 *
 * Security: Private key is transmitted over HTTPS, used immediately for signing,
 * and not stored. Used only for this one-time broadcast.
 */
export async function POST(req: NextRequest) {
  try {
    const { operation, activePrivateKey } = await req.json();

    console.log('[SIGN-API] Received sign request');

    // Validate required fields
    if (!operation || !activePrivateKey) {
      return NextResponse.json(
        { error: 'Missing required fields: operation, activePrivateKey' },
        { status: 400 }
      );
    }

    // Parse the private key
    console.log('[SIGN-API] Parsing private key...');
    const key = PrivateKey.fromString(activePrivateKey);
    console.log('[SIGN-API] Key parsed successfully');

    // Broadcast the operation
    console.log('[SIGN-API] Broadcasting operation...', operation);
    const result = await client.broadcast.sendOperations(
      [['custom_json', operation]],
      key
    );

    console.log('[SIGN-API] Broadcast successful! TX:', result.id);

    // Add CORS headers for cross-origin requests from indiesmenu
    const response = NextResponse.json({
      success: true,
      txId: result.id
    }, { status: 200 });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

  } catch (error: any) {
    console.error('[SIGN-API] Error:', error);
    return NextResponse.json(
      {
        error: 'Signing/broadcasting failed',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
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
