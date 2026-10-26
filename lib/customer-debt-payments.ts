export type CustomerDebt = { id: string; debtor: string; creditor: string; amount_hbd: number };

function milli(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid HBD amount');
  return Math.round(value * 1000);
}

/** Allocate counter-debt offsets and actual payment oldest-first, without equal-share guesses. */
export function allocateCustomerDebtPayment(account: string, debts: CustomerDebt[], paymentHbd: number) {
  const owed = debts.filter((debt) => debt.debtor === account && debt.creditor === 'innopay');
  const counter = debts.filter((debt) => debt.debtor === 'innopay' && debt.creditor === account);
  if (owed.length + counter.length !== debts.length) throw new Error('Debt does not belong to customer/innopay pair');
  const gross = owed.reduce((sum, debt) => sum + milli(debt.amount_hbd), 0);
  let offset = counter.reduce((sum, debt) => sum + milli(debt.amount_hbd), 0);
  let cash = milli(paymentHbd);
  if (offset > gross || cash > gross - offset) throw new Error('Payment exceeds net customer debt');
  const allocations = counter.map((debt) => ({
    debtId: debt.id, paidHbd: milli(debt.amount_hbd) / 1000, nettedHbd: milli(debt.amount_hbd) / 1000, remainingHbd: 0,
  }));
  for (const debt of owed) {
    const amount = milli(debt.amount_hbd);
    const netted = Math.min(offset, amount);
    offset -= netted;
    const paid = Math.min(cash, amount - netted);
    cash -= paid;
    allocations.push({ debtId: debt.id, paidHbd: (netted + paid) / 1000, nettedHbd: netted / 1000,
      remainingHbd: (amount - netted - paid) / 1000 });
  }
  return allocations;
}
