import { describe, expect, it } from 'vitest';
import { allocateCustomerDebtPayment, type CustomerDebt } from './customer-debt-payments';

const debt = (id: string, amount: number, reverse = false): CustomerDebt => ({ id, amount_hbd: amount,
  debtor: reverse ? 'innopay' : 'alice', creditor: reverse ? 'alice' : 'innopay' });

describe('customer debt payment allocation', () => {
  it('pays the oldest debts in full before the next, with exact milli-HBD', () => {
    expect(allocateCustomerDebtPayment('alice', [debt('a', 1.234), debt('b', 3)], 2.522)).toEqual([
      { debtId: 'a', paidHbd: 1.234, nettedHbd: 0, remainingHbd: 0 },
      { debtId: 'b', paidHbd: 1.288, nettedHbd: 0, remainingHbd: 1.712 },
    ]);
  });
  it('accounts for both sides of netting without inventing equal shares', () => {
    expect(allocateCustomerDebtPayment('alice', [debt('a', 10), debt('b', 3, true)], 2)).toEqual([
      { debtId: 'b', paidHbd: 3, nettedHbd: 3, remainingHbd: 0 },
      { debtId: 'a', paidHbd: 5, nettedHbd: 3, remainingHbd: 5 },
    ]);
  });
  it('handles the savings remainder after the liquid payment was recorded', () => {
    expect(allocateCustomerDebtPayment('alice', [debt('a', 0.522)], 0.522)[0].remainingHbd).toBe(0);
  });
  it('rejects overpayment, invalid reads and foreign debts', () => {
    expect(() => allocateCustomerDebtPayment('alice', [debt('a', 1)], 2)).toThrow();
    expect(() => allocateCustomerDebtPayment('alice', [debt('a', NaN)], 0)).toThrow();
    expect(() => allocateCustomerDebtPayment('bob', [debt('a', 1)], 1)).toThrow();
  });
});
