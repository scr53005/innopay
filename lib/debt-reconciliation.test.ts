import { describe, expect, it } from 'vitest';
import { planUnallocatedReceipt } from './debt-reconciliation';
const txId = 'b'.repeat(40);
const debts = [9.662, 9.662, 3.296].map((originalHbd, index) => ({ id: `d${index}`, originalHbd,
  remainingHbd: index < 2 ? 3.457 : 3.296, payments: index < 2 ? [{ amountHbd: 6.205, txId }] : [] }));
describe('unallocated receipt reconciliation', () => {
  it('preserves the audited payments and allocates precisely the missing 6.204 HBD', () => {
    const result = planUnallocatedReceipt(debts, txId, 18.614);
    expect(result.additionalAllocationHbd).toBe(6.204);
    expect(result.plans.map((plan) => plan.additionalPaymentHbd)).toEqual([3.457, 2.747, 0]);
    expect(result.plans.map((plan) => plan.remainingHbd)).toEqual([0, 0.710, 3.296]);
  });
  it('is a no-op after the receipt has been fully reconciled', () => {
    const first = planUnallocatedReceipt(debts, txId, 18.614);
    const updated = debts.map((debt, index) => ({ ...debt, remainingHbd: first.plans[index].remainingHbd,
      payments: [...debt.payments, { amountHbd: first.plans[index].additionalPaymentHbd, txId }] }));
    expect(planUnallocatedReceipt(updated, txId, 18.614).additionalAllocationHbd).toBe(0);
  });
  it('rejects ledger drift and cash greater than the selected debts', () => {
    expect(() => planUnallocatedReceipt([{ ...debts[0], remainingHbd: 3 }], txId, 18.614)).toThrow('invariant');
    expect(() => planUnallocatedReceipt(debts, txId, 30)).toThrow('exceeds');
  });
});
