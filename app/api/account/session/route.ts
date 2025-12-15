// app/api/account/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/account/session?session_id=xxx
 * Returns full account credentials for internal flows (new_account)
 * Returns credential token for external flows
 *
 * SIMPLIFIED FLOW (internal):
 * 1. Success page has: session_id (from URL)
 * 2. Calls this endpoint and gets full credentials directly
 * 3. Stores in localStorage and redirects to /user
 *
 * Security: This is safe because we're staying on wallet.innopay.lu domain
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id parameter' },
        { status: 400 }
      );
    }

    console.log(`[ACCOUNT SESSION] Looking up credentials for session: ${sessionId}`);

    // Look up the credential session by Stripe session ID - get FULL credentials
    const credentialSession = await prisma.accountCredentialSession.findUnique({
      where: { stripeSessionId: sessionId },
    });

    if (!credentialSession) {
      // Webhook might not have completed yet - client should retry
      console.log(`[ACCOUNT SESSION] Not found yet for session: ${sessionId}`);
      return NextResponse.json(
        {
          ready: false,
          message: 'Account creation in progress, please wait...'
        },
        { status: 202 } // 202 Accepted (processing)
      );
    }

    // Check if expired
    if (credentialSession.expiresAt < new Date()) {
      console.warn(`[ACCOUNT SESSION] Session expired: ${sessionId}`);
      return NextResponse.json(
        { error: 'Credential session has expired' },
        { status: 410 } // 410 Gone
      );
    }

    console.log(`[ACCOUNT SESSION] Found credentials for account: ${credentialSession.accountName}`);

    // Return FULL credentials directly (no need for token ping-pong on same domain)
    return NextResponse.json({
      ready: true,
      accountName: credentialSession.accountName,
      masterPassword: credentialSession.masterPassword,
      euroBalance: parseFloat(credentialSession.euroBalance.toString()),
      email: credentialSession.email || null,
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
      // Also include token for backward compatibility with external flows
      credentialToken: credentialSession.id,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[ACCOUNT SESSION] Error looking up session:', error);
    return NextResponse.json(
      {
        error: 'Failed to look up session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
