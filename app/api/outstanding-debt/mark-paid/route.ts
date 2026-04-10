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
 * Marks debts as fully settled after HBD arrives at creditor.
 * Called by liman's Inngest debt-repayment function after 3-day savings settlement.
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
    // Fetch current amount to record final payment in the ledger
    const existing = await prisma.outstanding_debt.findUnique({
      where: { id: debt.id },
    });

    if (!existing) continue;

    await prisma.$transaction([
      // Record the final payment in the debt_payment ledger
      prisma.debt_payment.create({
        data: {
          debt_id: debt.id,
          amount_hbd: Number(existing.amount_hbd),
          tx_id: debt.payment_tx_id,
          notes: 'Full settlement',
        },
      }),
      // Mark the debt as paid
      prisma.outstanding_debt.update({
        where: { id: debt.id },
        data: {
          status: 'paid',
          amount_hbd: 0,
          paid_at: now,
          payment_tx_id: debt.payment_tx_id,
        },
      }),
    ]);

    updated++;
  }

  console.warn(`[OUTSTANDING-DEBT] Marked paid: ${updated}/${debts.length} debts`);

  return NextResponse.json({ updated });
}
