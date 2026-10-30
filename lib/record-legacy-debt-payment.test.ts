import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordLegacyDebtPayments } from './record-legacy-debt-payment';

const mocks = vi.hoisted(() => ({ debts: vi.fn(), prior: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('./prisma', () => ({ default: { $transaction: (body: (tx: unknown) => unknown) => body({
  outstanding_debt: { findMany: mocks.debts, update: mocks.update },
  debt_payment: { findFirst: mocks.prior, create: mocks.create },
}) } }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prior.mockResolvedValue(null);
  mocks.debts.mockResolvedValue([9.662, 9.662, 3.296].map((amount_hbd, index) => ({
    id: `d${index}`, amount_hbd, status: 'withdrawal_pending', settlement_id: null,
  })));
});

describe('atomic legacy payment recording', () => {
  it('rejects the audited equal-share over-allocation before writing either of the other payments', async () => {
    await expect(recordLegacyDebtPayments([0, 1, 2].map((index) => ({
      debt_id: `d${index}`, amount_hbd: 6.205, tx_id: 'a'.repeat(40),
    })))).rejects.toThrow('exceeds');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not allocate the same receipt twice on retry', async () => {
    mocks.prior.mockResolvedValue({ amount_hbd: 6.205 });
    await expect(recordLegacyDebtPayments([{ debt_id: 'd0', amount_hbd: 6.205, tx_id: 'a'.repeat(40) }]))
      .resolves.toEqual({ settled: 1, already_recorded: 1 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('records an exactly capped debt as fully paid', async () => {
    await recordLegacyDebtPayments([{ debt_id: 'd2', amount_hbd: 3.296, tx_id: 'a'.repeat(40) }]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'paid', amount_hbd: 0 }),
    }));
  });
});
