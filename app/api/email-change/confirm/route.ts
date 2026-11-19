// POST /api/email-change/confirm — step 2 of "I no longer have access to my email"
// (HUB-USER-FEATURES-PLAN §2, A1).
//
// Body: { account, newEmail, code }
// No signature here: a pending 'email-change' row only exists for (user, newEmail) if step 1
// was signed with the wallet's active key, and the code proves control of the new mailbox.
// On success, in one transaction: innouser.email := newEmail, every OTHER address of this user
// is revoked as a recovery route, and an email_change audit row is written.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateHiveAccountName } from '@/lib/hive-account-name';
import { normalizeEmail } from '@/lib/email-normalize';

const MAX_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const account = typeof body.account === 'string' ? body.account.trim().replace(/^@/, '').toLowerCase() : '';
    const newEmail = normalizeEmail(body.newEmail);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!validateHiveAccountName(account).valid || !newEmail || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const wallet = await prisma.walletuser.findUnique({
      where: { accountName: account },
      select: { userId: true, innouser: { select: { email: true } } },
    });
    if (!wallet?.userId || !wallet.innouser) return NextResponse.json({ error: 'not_linked' }, { status: 404 });
    const userId = wallet.userId;

    const pending = await prisma.email_verification.findFirst({
      where: { user_id: userId, email: newEmail, purpose: 'email-change', verified: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });
    if (!pending) return NextResponse.json({ error: 'no_pending_code' }, { status: 404 });

    if (pending.code !== code) {
      const attempts = pending.attempts + 1;
      await prisma.email_verification.update({
        where: { id: pending.id },
        data: attempts >= MAX_ATTEMPTS ? { attempts, expires_at: new Date() } : { attempts },
      });
      return attempts >= MAX_ATTEMPTS
        ? NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
        : NextResponse.json({ error: 'wrong_code', attemptsLeft: MAX_ATTEMPTS - attempts }, { status: 400 });
    }

    // Re-check: someone may have taken the address between step 1 and now.
    const owner = await prisma.innouser.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (owner && owner.id !== userId) return NextResponse.json({ error: 'email_taken' }, { status: 409 });

    const now = new Date();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    try {
      await prisma.$transaction([
        prisma.email_verification.update({ where: { id: pending.id }, data: { verified: true, verified_at: now } }),
        prisma.innouser.update({ where: { id: userId }, data: { email: newEmail, verified: true } }),
        prisma.email_verification.updateMany({
          where: { user_id: userId, email: { not: newEmail }, revoked_at: null },
          data: { revoked_at: now },
        }),
        prisma.email_change.create({
          data: {
            user_id: userId,
            account_name: account,
            old_email: wallet.innouser.email,
            new_email: newEmail,
            method: 'signed',
            ip_address: ip.slice(0, 45),
          },
        }),
      ]);
    } catch (error: any) {
      if (error?.code === 'P2002') return NextResponse.json({ error: 'email_taken' }, { status: 409 });
      throw error;
    }

    console.warn('[EMAIL CHANGE] recovery email changed', { account, userId });
    return NextResponse.json({ changed: true, email: newEmail });
  } catch (error: any) {
    console.error('[EMAIL CHANGE] confirm failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
