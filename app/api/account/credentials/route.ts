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
 * NOTE: GET endpoint removed for security reasons.
 * Credential fetching by accountName is now handled by Server Action in /app/actions/get-credentials.ts
 * This prevents unauthorized external access to account credentials.
 */

/**
 * POST /api/account/credentials
 * Retrieves account credentials using credential token OR Stripe session ID
 * Body: { credentialToken?: string, sessionId?: string }
 *
 * Two paths:
 * 1. credentialToken - Used by INTERNAL flows (new_account) via /user/success page
 * 2. sessionId - Used by EXTERNAL flows (create_account_only, create_account_and_pay) from Stripe redirect
 *
 * Security:
 * - Token can only be used once (retrieved flag)
 * - Token expires after 5 minutes
 * - Returns all Hive keys for account setup
 */
export async function POST(req: NextRequest) {
  try {
    const { credentialToken, sessionId } = await req.json();

    // Validate required field - need at least one
    if (!credentialToken && !sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: credentialToken or sessionId' },
        { status: 400 }
      );
    }

    let lookupId: string;
    let credentialSession;

    // Path 1: Direct credential token lookup (INTERNAL flows)
    if (credentialToken) {
      console.log(`[CREDENTIALS] Looking up credential session by credentialToken: ${credentialToken}`);

      credentialSession = await prisma.accountCredentialSession.findUnique({
        where: { id: credentialToken },
      });

      if (!credentialSession) {
        console.warn(`[CREDENTIALS] Credential token not found: ${credentialToken}`);
        return NextResponse.json(
          { error: 'Invalid credential token' },
          { status: 404 }
        );
      }

      lookupId = credentialToken;
      console.log(`[CREDENTIALS] Found credential session: ${lookupId} for account: ${credentialSession.accountName}`);
    }
    // Path 2: Stripe session ID lookup (EXTERNAL flows)
    else if (sessionId) {
      console.log(`[CREDENTIALS] Looking up credential session by Stripe sessionId: ${sessionId}`);

      credentialSession = await prisma.accountCredentialSession.findFirst({
        where: {
          stripeSessionId: sessionId,
          retrieved: false
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!credentialSession) {
        console.warn(`[CREDENTIALS] No credential session found for sessionId: ${sessionId}`);
        return NextResponse.json(
          { error: 'Invalid session ID or credentials already retrieved' },
          { status: 404 }
        );
      }

      lookupId = credentialSession.id;
      console.log(`[CREDENTIALS] Found credential session: ${lookupId} for account: ${credentialSession.accountName}`);
    } else {
      // Should never reach here due to validation above
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // Check if already retrieved
    if (credentialSession.retrieved) {
      console.warn(`[CREDENTIALS] Token already used: ${lookupId}`);
      return NextResponse.json(
        { error: 'Credential token has already been used' },
        { status: 410 } // 410 Gone
      );
    }

    // Check if expired
    if (credentialSession.expiresAt < new Date()) {
      console.warn(`[CREDENTIALS] Token expired: ${lookupId}`);
      return NextResponse.json(
        { error: 'Credential token has expired' },
        { status: 410 } // 410 Gone
      );
    }

    // Mark as retrieved (one-time use)
    await prisma.accountCredentialSession.update({
      where: { id: lookupId },
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
