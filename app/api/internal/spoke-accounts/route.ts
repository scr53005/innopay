import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/internal/spoke-accounts  (authenticated, LIMAN_API_KEY)
 *
 * Returns EVERY spoke's Hive account across all environments — regardless of `settlement_enabled`
 * or `active`. This differs from `/settlement` (which returns only settlement-enabled accounts for
 * liman's reimbursement job): consumers that need the FULL spoke-account set — e.g. the
 * collateralization audit, which must EXCLUDE all spoke accounts (a spoke holds EURO/LEI it
 * received as payment, not IOU it backs with its own HBD) — use this.
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

  const accounts = await prisma.spoke_account.findMany({
    select: {
      spoke_id: true,
      hive_account: true,
      environment: true,
      role: true,
      active: true,
      settlement_enabled: true,
    },
    orderBy: [{ spoke_id: 'asc' }, { environment: 'asc' }, { hive_account: 'asc' }],
  });

  return NextResponse.json({ accounts });
}
