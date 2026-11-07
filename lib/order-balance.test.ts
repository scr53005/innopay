import { describe, expect, it } from 'vitest';
import { balanceAfterOrder } from './order-balance';

// Regression guard (2026-11-07): Flow 5 → 6 sent a 0 placeholder, indies showed 0.00 €.
describe('balanceAfterOrder', () => {
  it('balance read before the payment minus the order', () => {
    expect(balanceAfterOrder(30, 12.5, true)).toBe(17.5);
  });
  it('rounds to cents (no float noise like 17.499999)', () => {
    expect(balanceAfterOrder(20.3, 2.8, true)).toBe(17.5);
  });
  it('customer transfer failed (debt recorded): balance unchanged', () => {
    expect(balanceAfterOrder(30, 12.5, false)).toBe(30);
  });
  it('unknown before balance stays unknown, never 0', () => {
    expect(balanceAfterOrder(null, 12.5, true)).toBeNull();
    expect(balanceAfterOrder(NaN, 12.5, true)).toBeNull();
  });
  it('never negative', () => {
    expect(balanceAfterOrder(5, 12.5, true)).toBe(0);
  });
});
