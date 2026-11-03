import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordAuthoritySigning } from './authority-signing';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./prisma', () => ({ default: { innopay_authority_signing: { create: mocks.create } } }));
afterEach(() => vi.restoreAllMocks());

const entry = { signer: 'inno000-000-020', mode: 'explicit' as const, symbol: 'EURO', quantity: '3.58',
  toAccount: 'innopay', txId: 'b'.repeat(40) };

describe('recordAuthoritySigning', () => {
  it('stores the signing with the broadcast tx id', async () => {
    mocks.create.mockResolvedValue({});
    await recordAuthoritySigning(entry);
    expect(mocks.create).toHaveBeenCalledWith({ data: { signer: 'inno000-000-020', mode: 'explicit', symbol: 'EURO',
      quantity: '3.58', to_account: 'innopay', tx_id: 'b'.repeat(40) } });
  });

  it('never throws: the payment is already on chain when this runs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.create.mockRejectedValue(new Error('database unavailable'));
    await expect(recordAuthoritySigning(entry)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
