import { Prisma } from '@prisma/client';
import prisma from './prisma';

export type LegacyPayment = { debt_id: string; amount_hbd?: number; tx_id: string };

/** Validate the whole allocation before writing any row; retries reuse one receipt per debt. */
export async function recordLegacyDebtPayments(payments: LegacyPayment[]) {
  return prisma.$transaction(async (tx) => {
    const ids = payments.map((payment) => payment.debt_id);
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Distinct debts required');
    const debts = await tx.outstanding_debt.findMany({ where: { id: { in: ids } } });
    const plans = [];
    for (const payment of payments) {
      if (!/^[a-f0-9]{40}$/.test(payment.tx_id ?? '')) throw new Error('Actual Hive transaction ID required');
      const debt = debts.find((row) => row.id === payment.debt_id);
      if (!debt) throw new Error(`Debt ${payment.debt_id} not found`);
      if (debt.status === 'paid' && debt.payment_tx_id?.trim() === payment.tx_id) continue;
      const prior = await tx.debt_payment.findFirst({ where: { debt_id: debt.id, tx_id: payment.tx_id } });
      if (prior) {
        if (payment.amount_hbd !== undefined && Number(prior.amount_hbd) !== payment.amount_hbd) {
          throw new Error(`Debt ${debt.id}: receipt already allocated with another amount`);
        }
        continue;
      }
      if (debt.settlement_id) throw new Error(`Debt ${debt.id} belongs to the customer repayment workflow`);
      const allowed = payment.amount_hbd === undefined
        ? ['unpaid', 'recovery_ongoing', 'withdrawal_pending'] : ['withdrawal_pending'];
      if (!allowed.includes(debt.status)) throw new Error(`Debt ${debt.id} is not awaiting this payment`);
      const amount = payment.amount_hbd ?? Number(debt.amount_hbd);
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(debt.amount_hbd)
        || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 1e-7) {
        throw new Error(`Debt ${debt.id}: payment exceeds remaining debt or has invalid precision`);
      }
      plans.push({ debt, amount, txId: payment.tx_id });
    }
    for (const { debt, amount, txId } of plans) {
      const remaining = Math.round((Number(debt.amount_hbd) - amount) * 1000) / 1000;
      await tx.debt_payment.create({ data: {
        debt_id: debt.id, amount_hbd: amount, tx_id: txId,
        settlement_key: `legacy:${debt.id}:${txId}`, notes: remaining === 0 ? 'Full settlement' : 'Partial settlement',
      } });
      await tx.outstanding_debt.update({ where: { id: debt.id }, data: {
        amount_hbd: remaining, status: remaining === 0 ? 'paid' : 'unpaid',
        ...(remaining === 0 ? { paid_at: new Date(), payment_tx_id: txId } : {}),
      } });
    }
    return { settled: payments.length, already_recorded: payments.length - plans.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Netting has no Hive transaction. Validate each account pair balances before closing debts. */
export async function recordZeroNetDebts(ids: string[]) {
  return prisma.$transaction(async (tx) => {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Distinct debts required');
    const debts = await tx.outstanding_debt.findMany({ where: { id: { in: ids } } });
    if (debts.length !== ids.length) throw new Error('Missing netting debts');
    const open = [];
    const totals = new Map<string, number>();
    for (const debt of debts) {
      const prior = await tx.debt_payment.findUnique({ where: { settlement_key: `zero-net:${debt.id}` } });
      if (prior) continue;
      if (!['unpaid', 'recovery_ongoing'].includes(debt.status) || debt.settlement_id || debt.debtor === debt.creditor) {
        throw new Error('Netting requires unreserved open counter-debts');
      }
      const pair = [debt.debtor, debt.creditor].sort();
      const key = pair.join(':');
      const amount = Math.round(Number(debt.amount_hbd) * 1000);
      totals.set(key, (totals.get(key) ?? 0) + (debt.debtor === pair[0] ? amount : -amount));
      open.push(debt);
    }
    if ([...totals.values()].some((value) => value !== 0)) throw new Error('Counter-debts do not net to zero');
    for (const debt of open) {
      await tx.debt_payment.create({ data: { debt_id: debt.id, amount_hbd: debt.amount_hbd,
        tx_id: null, settlement_key: `zero-net:${debt.id}`, notes: 'Counter-debt netting; no on-chain payment' } });
      await tx.outstanding_debt.update({ where: { id: debt.id }, data: {
        status: 'paid', amount_hbd: 0, paid_at: new Date(), payment_tx_id: null,
      } });
    }
    return { updated: ids.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
