import { NextRequest, NextResponse } from 'next/server';
import { recordLegacyDebtPayments } from '../../../../lib/record-legacy-debt-payment';
import { validateLegacyPayments } from '../../../../lib/legacy-debt-payment';

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

  try {
    validateLegacyPayments(payments);
    return NextResponse.json(await recordLegacyDebtPayments(payments));
  } catch (error) {
    console.error('[PARTIAL-SETTLE] Allocation rejected:', error);
    return NextResponse.json({ error: String(error) }, { status: 409 });
  }
}
