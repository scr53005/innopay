import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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

  return url;
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

  const redirectUrl = appendReturnParams(parsedReturnUrl.toString(), {
    sessionId,
    credentialToken,
  });

  console.log('[FLOW 7 RETURN] Redirecting to spoke:', {
    sessionId,
    credentialToken: credentialToken || null,
    returnUrl: parsedReturnUrl.toString(),
    redirectUrl: redirectUrl.toString(),
  });

  return NextResponse.redirect(redirectUrl);
}
