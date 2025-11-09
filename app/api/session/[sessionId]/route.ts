// app/api/session/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { generateHiveKeys, getSeed } from '@/services/hive';
import { findWalletUserByAccountName } from '@/services/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * GET /api/session/[sessionId]
 * Fetches Stripe session details and returns account credentials
 * This is used by the success page to display credentials to the user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if this is an account creation flow
    if (session.metadata?.flow !== 'account_creation') {
      return NextResponse.json(
        { error: 'This session is not for account creation' },
        { status: 400 }
      );
    }

    const accountName = session.metadata.accountName;

    if (!accountName) {
      return NextResponse.json(
        { error: 'Account name not found in session' },
        { status: 400 }
      );
    }

    // Retrieve account details from database
    const walletUser = await findWalletUserByAccountName(accountName);

    if (!walletUser) {
      return NextResponse.json(
        { error: 'Account not found in database' },
        { status: 404 }
      );
    }

    // If seed or masterPassword is missing (shouldn't happen for new accounts), regenerate
    let seed = walletUser.seed;
    let masterPassword = walletUser.masterPassword;

    if (!seed || !masterPassword) {
      console.warn(`[SESSION] Missing seed/masterPassword for ${accountName}, regenerating...`);
      seed = getSeed(accountName);
      const keychain = generateHiveKeys(accountName, seed);
      masterPassword = keychain.masterPassword;
    }

    // Return account details
    return NextResponse.json({
      accountName,
      seed,
      masterPassword,
      hiveTxId: walletUser.hivetxid,
      bonusAmount: session.metadata.bonusAmount ? parseFloat(session.metadata.bonusAmount) : 0,
    });

  } catch (error: any) {
    console.error('Error fetching session details:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch session details',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
