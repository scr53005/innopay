import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import prisma from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

function normalizeAccountName(accountName: string): string {
  return accountName.trim().replace(/^@/, '');
}

function formatHbd(amount: number): string {
  return amount.toFixed(3) + ' HBD';
}

/** Human-friendly duration for the link's validity (e.g. "7 days", "5 hours", "14 minutes"). */
function formatTtl(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return '7 days';
  if (days >= 1) {
    const d = Math.round(days);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  const hours = days * 24;
  if (hours >= 1) {
    const h = Math.round(hours);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.round(hours * 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * POST /api/internal/savings-withdrawal-alert  (called by Liman's savings guard)
 *
 * Emails the account owner that a withdrawal from their savings was detected
 * and stopped, with a 7-day confirm link. Innopay owns the verified-email
 * channel; Liman never touches the Innopay DB. Body:
 *   { account_name, amount_hbd, confirm_token }
 * Returns { sent: true } | { sent: false, reason } (same shape as debt-reminders).
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    account_name?: string;
    amount_hbd?: number;
    confirm_token?: string;
    ttl_days?: number;
  };

  if (!body.account_name || typeof body.amount_hbd !== 'number' || !body.confirm_token) {
    return NextResponse.json(
      { error: 'account_name, amount_hbd and confirm_token are required' },
      { status: 400 },
    );
  }

  const normalizedAccount = normalizeAccountName(body.account_name);
  const accountCandidates = [...new Set([body.account_name.trim(), normalizedAccount, '@' + normalizedAccount])];

  const wallet = await prisma.walletuser.findFirst({
    where: { accountName: { in: accountCandidates }, userId: { not: null } },
    include: { innouser: true },
  });

  const email = wallet?.innouser?.email;
  if (!email) {
    console.warn('[SAVINGS-ALERT] No linked email for @' + normalizedAccount);
    return NextResponse.json({ sent: false, reason: 'no_linked_email', account_name: normalizedAccount });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://innopay.lu';
  const confirmUrl = `${base}/confirm-withdrawal?token=${encodeURIComponent(body.confirm_token)}`;
  const amountStr = formatHbd(body.amount_hbd);
  const ttlStr = formatTtl(typeof body.ttl_days === 'number' ? body.ttl_days : 7);

  const subject = `Security check: confirm a withdrawal from @${normalizedAccount}`;

  const text = [
    `Hello,`,
    ``,
    `A withdrawal of ${amountStr} from your Innopay account @${normalizedAccount} has been requested.`,
    ``,
    `As a precaution, Innopay has already stopped it. To let it proceed, confirm it was you (link valid for ${ttlStr}):`,
    confirmUrl,
    ``,
    `If this wasn't you, you don't need to do anything — your money is safe. The withdrawal stays cancelled and will expire on its own.`,
    ``,
    `Innopay`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>Hello,</p>
      <p>A withdrawal of <strong>${amountStr}</strong> from your Innopay account <strong>@${normalizedAccount}</strong> has been requested.</p>
      <p>As a precaution, Innopay has already stopped it. To let it proceed, confirm it was you (link valid for ${ttlStr}):</p>
      <p>
        <a href="${confirmUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">
          Yes, this was me — confirm withdrawal
        </a>
      </p>
      <p style="color:#4b5563;">If this wasn't you, <strong>you don't need to do anything — your money is safe.</strong> The withdrawal stays cancelled and will expire on its own.</p>
      <p>Innopay</p>
    </div>
  `;

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu';

  try {
    await resend.emails.send({ from, to: email, subject, text, html });
  } catch (e) {
    console.error('[SAVINGS-ALERT] Resend failed for @' + normalizedAccount + ':', e);
    return NextResponse.json(
      { sent: false, reason: 'resend_failed', account_name: normalizedAccount },
      { status: 502 },
    );
  }

  console.warn('[SAVINGS-ALERT] Sent withdrawal confirm to ' + email + ' for @' + normalizedAccount + ' (' + amountStr + ')');

  return NextResponse.json({ sent: true, account_name: normalizedAccount, email, from });
}
