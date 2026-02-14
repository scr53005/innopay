import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

/**
 * POST /api/outstanding-debt/mark-paid
 * Marks debts as fully settled after HBD transfer to creditor.
 * Called by liman's airlock execute endpoint after Phase 2 (debt_transfer) broadcast.
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { debts } = await req.json() as {
    debts: Array<{ id: string; payment_tx_id: string }>;
  };

  if (!debts || !Array.isArray(debts) || debts.length === 0) {
    return NextResponse.json({ error: 'debts required (non-empty array of { id, payment_tx_id })' }, { status: 400 });
  }

  let updated = 0;
  const now = new Date();

  for (const debt of debts) {
    const result = await prisma.outstanding_debt.update({
      where: { id: debt.id },
      data: {
        status: 'paid',
        paid_at: now,
        payment_tx_id: debt.payment_tx_id,
      },
    });
    if (result) updated++;
  }

  console.warn(`[OUTSTANDING-DEBT] Marked paid: ${updated}/${debts.length} debts`);

  return NextResponse.json({ updated });
}
