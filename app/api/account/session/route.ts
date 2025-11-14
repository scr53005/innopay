// app/api/account/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/account/session?session_id=xxx
 * Looks up the credential token for a Stripe session
 * Used by success page to get the token needed to retrieve credentials
 *
 * Flow:
 * 1. Success page has: session_id (from URL)
 * 2. Calls this endpoint to get: credentialToken
 * 3. Uses credentialToken to call /api/account/credentials
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

    console.log(`[ACCOUNT SESSION] Looking up credential token for session: ${sessionId}`);

    // Look up the credential session by Stripe session ID
    const credentialSession = await prisma.accountCredentialSession.findUnique({
      where: { stripeSessionId: sessionId },
      select: {
        id: true,
        accountName: true,
        retrieved: true,
        expiresAt: true,
      },
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

    console.log(`[ACCOUNT SESSION] Found credential token for account: ${credentialSession.accountName}`);

    return NextResponse.json({
      ready: true,
      credentialToken: credentialSession.id,
      accountName: credentialSession.accountName,
      retrieved: credentialSession.retrieved,
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
