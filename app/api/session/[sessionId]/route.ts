// app/api/session/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { generateHiveKeys, getSeed } from '@/services/hive';

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

    // Regenerate the seed and keys (same as webhook did)
    // NOTE: In a real production system, you'd want to retrieve this from a secure database
    // instead of regenerating. This is only safe because the seed generation is deterministic.
    const seed = getSeed(accountName);
    const keychain = generateHiveKeys(accountName, seed);

    // Return account details
    return NextResponse.json({
      accountName,
      seed,
      masterPassword: keychain.masterPassword,
      hiveTxId: session.metadata.hiveTxId || 'pending',
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
