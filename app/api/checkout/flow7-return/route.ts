import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import prisma from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

const CREDENTIAL_WAIT_ATTEMPTS = 12;
const CREDENTIAL_WAIT_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendReturnParams(
  returnUrl: string,
  params: {
    sessionId: string;
    credentialToken?: string;
    optimisticBalance?: number;
  },
) {
  const url = new URL(returnUrl);
  url.searchParams.set('order_success', 'true');
  url.searchParams.set('flow', '7');

  if (params.credentialToken) {
    url.searchParams.set('credential_token', params.credentialToken);
    url.searchParams.delete('session_id');
    url.searchParams.delete('credential_pending');
  } else {
    url.searchParams.set('session_id', params.sessionId);
    url.searchParams.set('credential_pending', 'true');
  }

  if (typeof params.optimisticBalance === 'number' && !isNaN(params.optimisticBalance)) {
    url.searchParams.set('optimistic_balance', params.optimisticBalance.toFixed(2));
  }

  return url;
}

/**
 * Compute the spoke's optimistic post-Flow-7 balance from the Stripe session
 * metadata: pre-topup balance + topup amount - order amount. Returns null if
 * any piece is missing (e.g., metadata wasn't recorded — older sessions or
 * non-Flow-7 fallbacks). The spoke uses this value to display the right
 * MiniWallet balance immediately on return; a fresh on-chain fetch overrides
 * it once the trust window expires.
 */
async function computeOptimisticBalance(sessionId: string): Promise<number | null> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const md = session.metadata || {};
    const pre = md.accountBalanceBeforeTopup ? parseFloat(md.accountBalanceBeforeTopup) : NaN;
    const order = md.orderAmountEuro ? parseFloat(md.orderAmountEuro) : 0;
    const topupCents = session.amount_total ?? 0;
    const topup = topupCents / 100;

    if (isNaN(pre) || isNaN(topup)) return null;

    const result = pre + topup - order;
    return Math.max(0, result);
  } catch (err) {
    console.warn('[FLOW 7 RETURN] Could not compute optimistic balance:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  const returnUrl = request.nextUrl.searchParams.get('return_url');

  if (!sessionId || !returnUrl) {
    return NextResponse.json(
      { error: 'Missing session_id or return_url' },
      { status: 400 },
    );
  }

  let parsedReturnUrl: URL;
  try {
    parsedReturnUrl = new URL(returnUrl);
  } catch {
    return NextResponse.json(
      { error: 'Invalid return_url' },
      { status: 400 },
    );
  }

  if (!['http:', 'https:'].includes(parsedReturnUrl.protocol)) {
    return NextResponse.json(
      { error: 'Invalid return_url protocol' },
      { status: 400 },
    );
  }

  let credentialToken: string | undefined;
  for (let attempt = 0; attempt < CREDENTIAL_WAIT_ATTEMPTS; attempt++) {
    const credentialSession = await prisma.accountCredentialSession.findFirst({
      where: {
        stripeSessionId: sessionId,
        retrieved: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (credentialSession) {
      credentialToken = credentialSession.id;
      break;
    }

    await sleep(CREDENTIAL_WAIT_MS);
  }

  const optimisticBalance = await computeOptimisticBalance(sessionId);

  const redirectUrl = appendReturnParams(parsedReturnUrl.toString(), {
    sessionId,
    credentialToken,
    optimisticBalance: optimisticBalance ?? undefined,
  });

  console.log('[FLOW 7 RETURN] Redirecting to spoke:', {
    sessionId,
    credentialToken: credentialToken || null,
    optimisticBalance,
    returnUrl: parsedReturnUrl.toString(),
    redirectUrl: redirectUrl.toString(),
  });

  return NextResponse.redirect(redirectUrl);
}
