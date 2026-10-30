import { NextRequest, NextResponse } from 'next/server';
import { recordLegacyDebtPayments, recordZeroNetDebts } from '../../../../lib/record-legacy-debt-payment';

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

  const { debts, netting } = await req.json() as {
    debts: Array<{ id: string; payment_tx_id: string }>;
    netting?: boolean;
  };

  if (!debts || !Array.isArray(debts) || debts.length === 0) {
    return NextResponse.json({ error: 'debts required (non-empty array of { id, payment_tx_id })' }, { status: 400 });
  }

  try {
    if (netting === true) return NextResponse.json(await recordZeroNetDebts(debts.map((debt) => debt.id)));
    const result = await recordLegacyDebtPayments(debts.map((debt) => ({ debt_id: debt.id, tx_id: debt.payment_tx_id })));
    return NextResponse.json({ updated: result.settled, already_recorded: result.already_recorded });
  } catch (error) {
    console.error('[MARK-PAID] Settlement rejected:', error);
    return NextResponse.json({ error: String(error) }, { status: 409 });
  }
}
