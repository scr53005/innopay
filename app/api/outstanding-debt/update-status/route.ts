import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

const ALLOWED_STATUSES = ['withdrawal_pending', 'settled_out_of_band', 'recovery_ongoing'];

/**
 * POST /api/outstanding-debt/update-status
 * Transitions debt status (e.g., unpaid → withdrawal_pending after Phase 1 execute).
 * Called by liman's airlock execute endpoint.
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { debt_ids, status } = await req.json() as {
    debt_ids: string[];
    status: string;
  };

  if (!debt_ids || !Array.isArray(debt_ids) || debt_ids.length === 0) {
    return NextResponse.json({ error: 'debt_ids required (non-empty array)' }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await prisma.outstanding_debt.updateMany({
    where: { id: { in: debt_ids } },
    data: { status },
  });

  console.warn(`[OUTSTANDING-DEBT] Status updated: ${debt_ids.length} debts → ${status} (${result.count} rows affected)`);

  return NextResponse.json({ updated: result.count });
}
