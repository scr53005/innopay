import { describe, expect, it } from 'vitest';
import { canUpdateDebtStatus } from './debt-status-rules';
describe('debt lifecycle protection', () => {
  it('does not reopen paid debt or overwrite an active customer settlement', () => {
    expect(canUpdateDebtStatus('paid', 'withdrawal_pending', false)).toBe(false);
    expect(canUpdateDebtStatus('unpaid', 'settled_out_of_band', true)).toBe(false);
    expect(canUpdateDebtStatus('withdrawal_pending', 'settled_out_of_band', false)).toBe(false);
  });
  it('permits valid open-debt transitions and harmless retries', () => {
    expect(canUpdateDebtStatus('unpaid', 'withdrawal_pending', false)).toBe(true);
    expect(canUpdateDebtStatus('withdrawal_pending', 'withdrawal_pending', false)).toBe(true);
    expect(canUpdateDebtStatus('settled_out_of_band', 'settled_out_of_band', false)).toBe(true);
  });
});
