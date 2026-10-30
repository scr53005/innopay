import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { canUpdateDebtStatus } from '../../../../lib/debt-status-rules';

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

  try {
    const ids = [...new Set(debt_ids)];
    const result = await prisma.$transaction(async (tx) => {
      const debts = await tx.outstanding_debt.findMany({ where: { id: { in: ids } } });
      if (debts.length !== ids.length || debts.some((debt) => !canUpdateDebtStatus(debt.status, status, !!debt.settlement_id))) {
        throw new Error('Debt no longer permits this transition; no status changed');
      }
      return tx.outstanding_debt.updateMany({ where: { id: { in: ids } }, data: { status } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ updated: result.count });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 409 }); }
}
