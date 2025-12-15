import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/account/create-credential-session
 * Creates a credential session for an existing account (for Flow 5 with existing account)
 *
 * Body: {
 *   accountName: string,
 *   masterPassword: string,
 *   keys: { active, posting, memo, owner },
 *   euroBalance: number,
 *   email?: string
 * }
 *
 * Returns: { credentialToken: string }
 *
 * This allows transferring existing account credentials from innopay to indiesmenu
 * without exposing them in URL parameters.
 */
export async function POST(req: NextRequest) {
  try {
    const { accountName, masterPassword, keys, euroBalance, email } = await req.json();

    // Validate required fields
    if (!accountName || !masterPassword || !keys) {
      return NextResponse.json(
        { error: 'Missing required fields: accountName, masterPassword, keys' },
        { status: 400 }
      );
    }

    console.log('[CREATE CREDENTIAL SESSION] Creating session for existing account:', accountName);

    // Create credential session (expires in 5 minutes, single-use)
    const credentialSession = await prisma.accountCredentialSession.create({
      data: {
        accountName,
        stripeSessionId: `existing_account_${Date.now()}`, // Placeholder since no Stripe session
        masterPassword,
        ownerPrivate: keys.owner.privateKey,
        ownerPublic: keys.owner.publicKey,
        activePrivate: keys.active.privateKey,
        activePublic: keys.active.publicKey,
        postingPrivate: keys.posting.privateKey,
        postingPublic: keys.posting.publicKey,
        memoPrivate: keys.memo.privateKey,
        memoPublic: keys.memo.publicKey,
        euroBalance: euroBalance || 0,
        email: email || null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    console.log('[CREATE CREDENTIAL SESSION] Session created with ID:', credentialSession.id);

    return NextResponse.json({
      credentialToken: credentialSession.id,
      success: true
    });

  } catch (error: any) {
    console.error('[CREATE CREDENTIAL SESSION] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create credential session', details: error.message },
      { status: 500 }
    );
  }
}
