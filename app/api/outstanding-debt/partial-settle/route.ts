import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

/**
 * POST /api/outstanding-debt/partial-settle
 * Records partial payments against debts after 3-day savings settlement.
 * Decrements amount_hbd, creates debt_payment row, sets status back to unpaid.
 * Called by liman's Inngest debt-repayment function for partial settlements.
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { payments } = await req.json() as {
    payments: Array<{ debt_id: string; amount_hbd: number; tx_id: string }>;
  };

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return NextResponse.json(
      { error: 'payments required (non-empty array of { debt_id, amount_hbd, tx_id })' },
      { status: 400 },
    );
  }

  let settled = 0;
  const errors: string[] = [];

  for (const payment of payments) {
    try {
      const debt = await prisma.outstanding_debt.findUnique({
        where: { id: payment.debt_id },
      });

      if (!debt) {
        errors.push(`debt ${payment.debt_id} not found`);
        continue;
      }

      if (debt.status !== 'withdrawal_pending') {
        errors.push(`debt ${payment.debt_id} status is '${debt.status}', expected 'withdrawal_pending'`);
        continue;
      }

      const currentAmount = Number(debt.amount_hbd);
      const paymentAmount = payment.amount_hbd;

      if (paymentAmount >= currentAmount) {
        errors.push(`debt ${payment.debt_id}: payment ${paymentAmount} >= remaining ${currentAmount} — use mark-paid for full settlement`);
        continue;
      }

      if (paymentAmount <= 0) {
        errors.push(`debt ${payment.debt_id}: payment amount must be positive`);
        continue;
      }

      const remaining = Math.round((currentAmount - paymentAmount) * 1000) / 1000;

      // Atomic: create payment record + decrement debt + set status back to unpaid
      await prisma.$transaction([
        prisma.debt_payment.create({
          data: {
            debt_id: payment.debt_id,
            amount_hbd: paymentAmount,
            tx_id: payment.tx_id,
            notes: `Partial settlement: ${paymentAmount} HBD of ${currentAmount} HBD (${remaining} HBD remaining)`,
          },
        }),
        prisma.outstanding_debt.update({
          where: { id: payment.debt_id },
          data: {
            amount_hbd: remaining,
            status: 'unpaid',
          },
        }),
      ]);

      settled++;
      console.warn(`[PARTIAL-SETTLE] Debt ${payment.debt_id}: ${currentAmount} → ${remaining} HBD (paid ${paymentAmount}, tx: ${payment.tx_id})`);
    } catch (e) {
      console.error(`[PARTIAL-SETTLE] Failed for debt ${payment.debt_id}:`, e);
      errors.push(`debt ${payment.debt_id}: ${e}`);
    }
  }

  console.warn(`[PARTIAL-SETTLE] Settled ${settled}/${payments.length} partial payments${errors.length > 0 ? ' | errors: ' + errors.join('; ') : ''}`);

  return NextResponse.json({ settled, errors: errors.length > 0 ? errors : undefined });
}
