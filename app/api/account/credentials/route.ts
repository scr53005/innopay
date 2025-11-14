// app/api/account/credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * OPTIONS /api/account/credentials
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  const response = NextResponse.json({}, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

/**
 * POST /api/account/credentials
 * Retrieves account credentials using a one-time credential token
 * Body: { credentialToken: string }
 *
 * Security:
 * - Token can only be used once (retrieved flag)
 * - Token expires after 5 minutes
 * - Returns all Hive keys for account setup
 */
export async function POST(req: NextRequest) {
  try {
    const { credentialToken } = await req.json();

    // Validate required field
    if (!credentialToken) {
      return NextResponse.json(
        { error: 'Missing required field: credentialToken' },
        { status: 400 }
      );
    }

    console.log(`[CREDENTIALS] Attempting to retrieve credentials for token: ${credentialToken}`);

    // Find the credential session
    const credentialSession = await prisma.accountCredentialSession.findUnique({
      where: { id: credentialToken },
    });

    // Check if session exists
    if (!credentialSession) {
      console.warn(`[CREDENTIALS] Token not found: ${credentialToken}`);
      return NextResponse.json(
        { error: 'Invalid credential token' },
        { status: 404 }
      );
    }

    // Check if already retrieved
    if (credentialSession.retrieved) {
      console.warn(`[CREDENTIALS] Token already used: ${credentialToken}`);
      return NextResponse.json(
        { error: 'Credential token has already been used' },
        { status: 410 } // 410 Gone
      );
    }

    // Check if expired
    if (credentialSession.expiresAt < new Date()) {
      console.warn(`[CREDENTIALS] Token expired: ${credentialToken}`);
      return NextResponse.json(
        { error: 'Credential token has expired' },
        { status: 410 } // 410 Gone
      );
    }

    // Mark as retrieved (one-time use)
    await prisma.accountCredentialSession.update({
      where: { id: credentialToken },
      data: { retrieved: true },
    });

    console.log(`[CREDENTIALS] Successfully retrieved credentials for account: ${credentialSession.accountName}`);

    // Return all credentials with CORS headers for cross-origin access
    const response = NextResponse.json({
      accountName: credentialSession.accountName,
      masterPassword: credentialSession.masterPassword,
      euroBalance: parseFloat(credentialSession.euroBalance.toString()),
      keys: {
        owner: {
          privateKey: credentialSession.ownerPrivate,
          publicKey: credentialSession.ownerPublic,
        },
        active: {
          privateKey: credentialSession.activePrivate,
          publicKey: credentialSession.activePublic,
        },
        posting: {
          privateKey: credentialSession.postingPrivate,
          publicKey: credentialSession.postingPublic,
        },
        memo: {
          privateKey: credentialSession.memoPrivate,
          publicKey: credentialSession.memoPublic,
        },
      },
    }, { status: 200 });

    // Add CORS headers to allow indiesmenu to call this API
    response.headers.set('Access-Control-Allow-Origin', '*'); // In production, specify exact origin
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

  } catch (error: any) {
    console.error('[CREDENTIALS] Error retrieving credentials:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve credentials',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
