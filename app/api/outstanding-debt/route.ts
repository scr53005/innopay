import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

/**
 * GET /api/outstanding-debt
 * Returns unpaid debts eligible for automated repayment.
 * Called by liman's cron to discover debts to process.
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const debts = await prisma.outstanding_debt.findMany({
    where: { status: { in: ['unpaid', 'recovery_ongoing'] } },
    orderBy: { created_at: 'asc' },
  });

  return NextResponse.json({ debts });
}
