// POST /api/email-change/request — step 1 of "I no longer have access to my email"
// (HUB-USER-FEATURES-PLAN §2, A1).
//
// Body: { account, newEmail, ts, nonce, signature, language? }
// The wallet on this device proves it holds the account's ACTIVE key (lib/account-proof.ts,
// signature bound to the new email), then a 6-digit code is mailed TO THE NEW ADDRESS.
// Step 2 (/api/email-change/confirm) swaps innouser.email once that code comes back:
// wallet control + control of the new mailbox, the old one is never needed.

import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { Resend } from 'resend';
import prisma from '@/lib/prisma';
import { checkAccountProof } from '@/lib/account-proof-server';
import { isSendableEmail, normalizeEmail } from '@/lib/email-normalize';
import { buildVerificationEmail, type Language } from '@/lib/email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);
const LANGUAGES: Language[] = ['en', 'fr', 'de', 'lb'];
const CODE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const account = typeof body.account === 'string' ? body.account.trim().replace(/^@/, '').toLowerCase() : '';
    const newEmail = normalizeEmail(body.newEmail);
    const language: Language = LANGUAGES.includes(body.language) ? body.language : 'en';

    if (!newEmail || !isSendableEmail(newEmail)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }

    const proof = await checkAccountProof(
      { purpose: 'email-change', account, payload: newEmail, ts: Number(body.ts), nonce: String(body.nonce ?? '') },
      String(body.signature ?? ''),
    );
    if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: proof.status });

    const wallet = await prisma.walletuser.findUnique({
      where: { accountName: account },
      select: { userId: true, innouser: { select: { email: true } } },
    });
    if (!wallet?.userId || !wallet.innouser) {
      // A wallet Innopay did not create (imported Hive account): no innouser to re-address.
      return NextResponse.json({ error: 'not_linked' }, { status: 404 });
    }
    // Exact comparison on purpose: a stored 'Anthony.Mansour0@…' may be re-set to its
    // lowercase form, which is what makes it findable by recovery again.
    if (wallet.innouser.email === newEmail) {
      return NextResponse.json({ error: 'same_email' }, { status: 400 });
    }
    // innouser.email is @unique (but has drifted dupes in prod, hence findFirst). Merging two
    // people is out of scope for self-service: send them to support.
    const owner = await prisma.innouser.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (owner && owner.id !== wallet.userId) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 });
    }

    // Same limits as /api/verify/request-code, counted per target mailbox (all purposes).
    const recent = await prisma.email_verification.count({
      where: { email: newEmail, created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= 5) return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
    const last = await prisma.email_verification.findFirst({
      where: { email: newEmail, created_at: { gte: new Date(Date.now() - 60 * 1000) } },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    if (last) {
      const retryAfter = Math.ceil((last.created_at.getTime() + 60_000 - Date.now()) / 1000);
      return NextResponse.json({ error: 'cooldown', retryAfter }, { status: 429 });
    }

    const code = randomInt(100000, 1000000).toString();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const pending = await prisma.email_verification.create({
      data: {
        user_id: wallet.userId,
        email: newEmail,
        code,
        purpose: 'email-change',
        expires_at: new Date(Date.now() + CODE_TTL_MS),
        ip_address: ip.slice(0, 45),
      },
    });

    const { subject, html, text } = buildVerificationEmail(code, language);
    let sendError: { name?: string; message?: string } | null = null;
    try {
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu',
        to: newEmail,
        subject,
        html,
        text,
      });
      // The Resend SDK reports refusals in `error` WITHOUT throwing.
      if (result.error) sendError = result.error;
    } catch (error: any) {
      sendError = { name: error?.name, message: error?.message };
    }
    if (sendError) {
      console.error('[EMAIL CHANGE] Resend refused the code email', {
        account, name: sendError.name, message: sendError.message?.replace(/[^\s@]+@[^\s@]+/g, '<email>'),
      });
      try {
        await prisma.email_verification.delete({ where: { id: pending.id } });
      } catch {
        // The row expires on its own in 10 minutes; the answer to the user stays the same.
      }
      return NextResponse.json({ error: 'email_send_failed' }, { status: 502 });
    }

    console.warn('[EMAIL CHANGE] code sent', { account, userId: wallet.userId });
    return NextResponse.json({ sent: true, expiresIn: CODE_TTL_MS / 1000 });
  } catch (error: any) {
    console.error('[EMAIL CHANGE] request failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
