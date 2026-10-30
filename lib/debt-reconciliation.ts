export type ReceiptDebt = { id: string; originalHbd: number; remainingHbd: number;
  payments: Array<{ amountHbd: number; txId: string | null }> };

/** Allocate unrecorded cash from an existing receipt; preserve every prior payment row. */
export function planUnallocatedReceipt(debts: ReceiptDebt[], txId: string, receivedHbd: number) {
  const units = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7) throw new Error('Invalid milli-HBD amount');
    return Math.round(value * 1000);
  };
  if (!/^[a-f0-9]{40}$/.test(txId) || new Set(debts.map((debt) => debt.id)).size !== debts.length) throw new Error('Invalid receipt/debt group');
  const allocated = debts.reduce((sum, debt) => sum + debt.payments.filter((payment) => payment.txId?.trim() === txId)
    .reduce((paid, payment) => paid + units(payment.amountHbd), 0), 0);
  let cash = units(receivedHbd) - allocated;
  if (cash < 0) throw new Error('Ledger already allocates more than the chain receipt');
  const plans = debts.map((debt) => {
    const original = units(debt.originalHbd), remaining = units(debt.remainingHbd);
    const prior = debt.payments.reduce((sum, payment) => sum + units(payment.amountHbd), 0);
    if (original - prior !== remaining) throw new Error(`Original/payment/remaining invariant failed for ${debt.id}`);
    const add = Math.min(cash, remaining); cash -= add;
    return { debtId: debt.id, additionalPaymentHbd: add / 1000, remainingHbd: (original - prior - add) / 1000 };
  });
  if (cash !== 0) throw new Error('Receipt exceeds this debt group; review customer credit separately');
  return { receivedHbd, previouslyAllocatedHbd: allocated / 1000,
    additionalAllocationHbd: plans.reduce((sum, plan) => sum + units(plan.additionalPaymentHbd), 0) / 1000, plans };
}
