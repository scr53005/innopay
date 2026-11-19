// app/api/account/email/route.ts
//
// POST /api/account/email — the email linked to THE CALLER'S OWN account.
// Body: { account, ts, nonce, signature } — a lib/account-proof.ts proof (purpose
// 'account-email', empty payload) that the caller holds the account's ACTIVE key.
//
// It used to be GET ?accountName=… with no proof. Innopay account names are sequential
// (inno000-000-0NN), so anyone could walk them and harvest every customer's email.
// Its only callers (the hub's landing top-up pre-fill and /user) already hold the active key.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkAccountProof } from '@/lib/account-proof-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const account = typeof body.account === 'string' ? body.account.trim().replace(/^@/, '').toLowerCase() : '';

    const proof = await checkAccountProof(
      { purpose: 'account-email', account, payload: '', ts: Number(body.ts), nonce: String(body.nonce ?? '') },
      String(body.signature ?? ''),
    );
    if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: proof.status });

    const walletUser = await prisma.walletuser.findUnique({
      where: { accountName: account },
      select: { innouser: { select: { email: true } } },
    });
    if (!walletUser?.innouser) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, email: walletUser.innouser.email });
  } catch (error: any) {
    console.error('[EMAIL API] lookup failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// Browsers still running a page cached before the switch call GET. Both callers treat a
// non-OK answer as "no email to show/pre-fill", so 410 degrades gracefully.
export async function GET() {
  return NextResponse.json({ error: 'gone_use_signed_post' }, { status: 410 });
}
