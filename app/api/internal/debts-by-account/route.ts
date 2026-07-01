import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/internal/debts-by-account?account=<name>  (authenticated, LIMAN_API_KEY)
 *
 * Returns EVERY outstanding_debt row where the account is debtor OR creditor — including PAID and
 * settled_out_of_band rows, which `/api/outstanding-debt` (open-only) omits. Used by the
 * collateralization per-account deep-dive: an unbacked-HBD excess is often explained by a debt
 * marked `paid` in the books whose HBD never actually left the account's savings, so the audit
 * needs the full ledger (with payments) for one account, not just the open slice.
 */
function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  return !!key && auth === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = req.nextUrl.searchParams.get('account')?.trim();
  if (!account) {
    return NextResponse.json({ error: 'account query param required' }, { status: 400 });
  }

  const debts = await prisma.outstanding_debt.findMany({
    where: { OR: [{ debtor: account }, { creditor: account }] },
    orderBy: { created_at: 'asc' },
    include: { payments: { orderBy: { paid_at: 'asc' } } },
  });

  return NextResponse.json({ account, debts });
}
