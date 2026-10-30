import { describe, expect, it } from 'vitest';
import { validateLegacyPayments } from './legacy-debt-payment';

describe('legacy payment validation', () => {
  const payment = { debt_id: 'd1', amount_hbd: 6.205, tx_id: 'a'.repeat(40) };
  it('rejects blank receipts, non-finite values, excess precision and duplicate debt allocations', () => {
    for (const change of [{ tx_id: ' '.repeat(40) }, { amount_hbd: NaN }, { amount_hbd: 6.204666 }, { amount_hbd: -1 }]) {
      expect(() => validateLegacyPayments([{ ...payment, ...change }])).toThrow();
    }
    expect(() => validateLegacyPayments([payment, payment])).toThrow('distinct');
    expect(() => validateLegacyPayments([payment])).not.toThrow();
  });
});
