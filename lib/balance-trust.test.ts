import { describe, expect, it } from 'vitest';
import { BALANCE_KEY, TRUST_UNTIL_KEY, newAccountBalance, seedTrustedBalance } from './balance-trust';

describe('seedTrustedBalance', () => {
  it('stores the balance and a one-minute trust window', () => {
    const store = new Map<string, string>();
    seedTrustedBalance({ setItem: (k, v) => { store.set(k, v); } }, 5, 1_000);
    expect(store.get(BALANCE_KEY)).toBe('5.00');
    expect(store.get(TRUST_UNTIL_KEY)).toBe('61000');
  });
});

// Regression (2026-11-07): a new hub account loaded with 5 € showed 0.00 € until a refresh.
describe('newAccountBalance', () => {
  it('uses the credential session figure (includes any campaign bonus)', () => {
    expect(newAccountBalance(15, '10')).toBe(15);
  });
  it('falls back to the amount charged when the session gives 0 or nothing', () => {
    expect(newAccountBalance(0, '5')).toBe(5);
    expect(newAccountBalance(undefined, '5')).toBe(5);
  });
  it('unknown when neither is usable', () => {
    expect(newAccountBalance(undefined, null)).toBeNull();
    expect(newAccountBalance(0, 'abc')).toBeNull();
  });
});
