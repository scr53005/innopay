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

type ReminderDebt = {
  debt_id: string;
  amount_hbd: number;
  creditor: string;
  reason: string;
  recorded_at: string | null;
};

function normalizeAccountName(accountName: string): string {
  return accountName.trim().replace(/^@/, '');
}

function formatHbd(amount: number): string {
  return amount.toFixed(3) + ' HBD';
}

function formatDate(value: string | null): string {
  if (!value) return 'date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date unavailable';
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildEmail(params: {
  accountName: string;
  amountHbd: number;
  responseDays: number;
  debts: ReminderDebt[];
}) {
  // TODO: include the spoke/merchant where each debt was incurred once innopay stores that link.
  const debtRowsText = params.debts
    .map((debt) => `- ${formatHbd(debt.amount_hbd)} recorded on ${formatDate(debt.recorded_at)}`)
    .join('\n');

  const supportRowsText = params.debts
    .map((debt) => `- ${debt.debt_id}`)
    .join('\n');

  const debtRowsHtml = params.debts
    .map((debt) => `<li>${formatHbd(debt.amount_hbd)} recorded on ${formatDate(debt.recorded_at)}</li>`)
    .join('');

  const supportRowsHtml = params.debts
    .map((debt) => `<li><code>${debt.debt_id}</code></li>`)
    .join('');

  const subject = `Action requested: ${formatHbd(params.amountHbd)} needed in @${params.accountName} savings`;

  const text = [
    `Hello,`,
    ``,
    `Innopay recorded an outstanding balance of ${formatHbd(params.amountHbd)} for Hive account @${params.accountName}.`,
    ``,
    `Please transfer at least ${formatHbd(params.amountHbd)} into HBD savings for @${params.accountName} within ${params.responseDays} days. Innopay will then use those savings to settle the outstanding balance automatically.`,
    ``,
    `Recorded debt details:`,
    debtRowsText,
    ``,
    `If you have questions, please contact contact@innopay.lu and include the support references below.`,
    ``,
    `Support references:`,
    supportRowsText,
    ``,
    `Innopay`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>Hello,</p>
      <p>Innopay recorded an outstanding balance of <strong>${formatHbd(params.amountHbd)}</strong> for Hive account <strong>@${params.accountName}</strong>.</p>
      <p>Please transfer at least <strong>${formatHbd(params.amountHbd)}</strong> into HBD savings for <strong>@${params.accountName}</strong> within ${params.responseDays} days. Innopay will then use those savings to settle the outstanding balance automatically.</p>
      <p><strong>Recorded debt details</strong></p>
      <ul>${debtRowsHtml}</ul>
      <p>If you have questions, please contact <a href="mailto:contact@innopay.lu">contact@innopay.lu</a> and include the support references below.</p>
      <p><strong>Support references</strong></p>
      <ul>${supportRowsHtml}</ul>
      <p>Innopay</p>
    </div>
  `;

  return { subject, text, html };
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    account_name?: string;
    debt_total_hbd?: number;
    response_days?: number;
    debt_ids?: string[];
    debts?: ReminderDebt[];
  };

  if (!body.account_name || typeof body.debt_total_hbd !== 'number') {
    return NextResponse.json({ error: 'account_name and debt_total_hbd are required' }, { status: 400 });
  }

  const normalizedAccount = normalizeAccountName(body.account_name);
  const accountCandidates = [...new Set([body.account_name.trim(), normalizedAccount, '@' + normalizedAccount])];

  const wallet = await prisma.walletuser.findFirst({
    where: {
      accountName: { in: accountCandidates },
      userId: { not: null },
    },
    include: { innouser: true },
  });

  const email = wallet?.innouser?.email;
  if (!email) {
    console.warn('[DEBT-REMINDER] No linked email for @' + normalizedAccount);
    return NextResponse.json({ sent: false, reason: 'no_linked_email', account_name: normalizedAccount });
  }

  const debts = body.debts && body.debts.length > 0
    ? body.debts
    : (body.debt_ids ?? []).map((debtId) => ({
      debt_id: debtId,
      amount_hbd: body.debt_total_hbd ?? 0,
      creditor: 'innopay',
      reason: 'outstanding_debt',
      recorded_at: null,
    }));

  const responseDays = body.response_days && body.response_days > 0 ? body.response_days : 7;
  const emailBody = buildEmail({
    accountName: normalizedAccount,
    amountHbd: body.debt_total_hbd,
    responseDays,
    debts,
  });

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu';

  try {
    await resend.emails.send({
      from,
      to: email,
      subject: emailBody.subject,
      text: emailBody.text,
      html: emailBody.html,
    });
  } catch (e) {
    console.error('[DEBT-REMINDER] Resend failed for @' + normalizedAccount + ':', e);
    return NextResponse.json({
      sent: false,
      reason: 'resend_failed',
      account_name: normalizedAccount,
    }, { status: 502 });
  }

  console.warn('[DEBT-REMINDER] Sent reminder to ' + email + ' for @' + normalizedAccount + ' (' + formatHbd(body.debt_total_hbd) + ')');

  return NextResponse.json({
    sent: true,
    account_name: normalizedAccount,
    email,
    from,
  });
}
