import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { allocateCustomerDebtPayment } from '@/lib/customer-debt-payments';

/** Claim/record/release a customer repayment. Liman uses this API, never the hub DB. */
export async function POST(request: NextRequest) {
  const key = process.env.LIMAN_API_KEY;
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json() as {
    action: 'claim' | 'record' | 'release'; account: string; settlement_id: string; debt_ids: string[];
    phase?: 'liquid' | 'savings'; amount_hbd?: number; tx_id?: string;
  };
  if (!['claim', 'record', 'release'].includes(body.action)
    || !/^[a-z0-9.-]{3,16}$/.test(body.account ?? '') || body.account === 'innopay'
    || !/^[a-z0-9]{1,30}$/i.test(body.settlement_id ?? '')
    || !Array.isArray(body.debt_ids) || !body.debt_ids.length
    || body.debt_ids.some((id) => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'Invalid customer settlement request' }, { status: 400 });
  }
  if (body.action === 'record' && (!['liquid', 'savings'].includes(body.phase ?? '')
    || !Number.isFinite(body.amount_hbd) || !(body.amount_hbd! > 0)
    || !/^[a-f0-9]{40}$/.test(body.tx_id ?? ''))) {
    return NextResponse.json({ error: 'A positive payment, phase and Hive transaction ID are required' }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const debts = await tx.outstanding_debt.findMany({
        where: { id: { in: [...new Set(body.debt_ids)] } }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      if (debts.length !== new Set(body.debt_ids).size) throw new Error('Some debts no longer exist');
      if (debts.some((debt) => !(
        debt.debtor === body.account && debt.creditor === 'innopay'
        || debt.debtor === 'innopay' && debt.creditor === body.account
      ))) throw new Error('Debt does not belong to customer/innopay pair');

      if (body.action === 'release') {
        for (const debt of debts.filter((row) => row.settlement_id === body.settlement_id)) {
          await tx.outstanding_debt.update({ where: { id: debt.id }, data: {
            settlement_id: null,
            ...(Number(debt.amount_hbd) > 0 ? { status: 'unpaid' } : {}),
          } });
        }
        return { released: true };
      }

      const phaseKey = `${body.settlement_id}:${body.phase}:`;
      if (body.action === 'record') {
        const prior = await tx.debt_payment.findMany({ where: { settlement_key: { startsWith: phaseKey } } });
        if (prior.length) {
          if (prior.some((payment) => payment.tx_id !== body.tx_id
            || JSON.parse(payment.notes ?? '{}').payment_hbd !== body.amount_hbd)) {
            throw new Error('Settlement phase already recorded with another transaction or amount');
          }
          return { recorded: true, already_recorded: true };
        }
      }
      const open = debts.filter((debt) => Number(debt.amount_hbd) > 0 && !['paid', 'settled_out_of_band'].includes(debt.status));
      if (!open.length) {
        if (body.action === 'record') throw new Error('Debts were already settled outside this payment phase');
        return { claimed: true, already_settled: true };
      }
      if (open.some((debt) => debt.settlement_id && debt.settlement_id !== body.settlement_id)) {
        throw new Error('A different settlement already owns this debt');
      }
      if (body.action === 'claim') {
        if (open.some((debt) => !debt.settlement_id && !['unpaid', 'recovery_ongoing'].includes(debt.status))) {
          throw new Error('An existing withdrawal is already settling this debt');
        }
        await tx.outstanding_debt.updateMany({ where: { id: { in: open.map((debt) => debt.id) } },
          data: { settlement_id: body.settlement_id, status: 'withdrawal_pending' } });
        return { claimed: true };
      }
      if (open.some((debt) => debt.settlement_id !== body.settlement_id)) throw new Error('Claim debts before recording payment');
      const allocations = allocateCustomerDebtPayment(body.account, open.map((debt) => ({
        id: debt.id, debtor: debt.debtor, creditor: debt.creditor, amount_hbd: Number(debt.amount_hbd),
      })), body.amount_hbd!);
      for (const allocation of allocations) {
        if (allocation.paidHbd <= 0) continue;
        await tx.debt_payment.create({ data: {
          debt_id: allocation.debtId, amount_hbd: allocation.paidHbd, tx_id: body.tx_id,
          settlement_key: phaseKey + allocation.debtId,
          notes: JSON.stringify({ settlement_id: body.settlement_id, phase: body.phase,
            payment_hbd: body.amount_hbd, netted_hbd: allocation.nettedHbd }),
        } });
        await tx.outstanding_debt.update({ where: { id: allocation.debtId }, data: {
          amount_hbd: allocation.remainingHbd,
          status: allocation.remainingHbd === 0 ? 'paid' : 'withdrawal_pending',
          ...(allocation.remainingHbd === 0 ? { paid_at: new Date(), payment_tx_id: body.tx_id } : {}),
        } });
      }
      return { recorded: true, allocations };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[CUSTOMER-SETTLEMENT] Ledger update failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Settlement failed' }, { status: 409 });
  }
}
