import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), transfer: vi.fn() }));
vi.mock('./prisma', () => ({ default: {
  spoke_account: { findFirst: m.findFirst },
  rubis_reward: { create: m.create, update: m.update },
} }));
vi.mock('../services/hive', () => ({ transferEuroTokens: m.transfer }));

import { rewardOrder } from './rubis-distribute';

const order = {
  orderKey: 'wallet:' + 'a'.repeat(40), customerAccount: 'alice', recipient: 'millewee',
  orderTotal: 22, memo: 'd:1 T:2.00 TABLE 4 kcs-inno-ab12-cd34',
};
const spoke = (over: Record<string, unknown> = {}) => ({ spoke: { id: 'millewee', name: 'Millewee', rubis_rate: '0.1000', rubis_tip_multiplier: '2.00', ...over } });

beforeEach(() => {
  vi.clearAllMocks();
  m.findFirst.mockResolvedValue(spoke());
  m.create.mockResolvedValue({});
  m.update.mockResolvedValue({});
  m.transfer.mockResolvedValue('c'.repeat(40));
});

describe('rewardOrder', () => {
  it('sends RUBIS from innopay to the customer (tip doubled) and records it sent', async () => {
    const r = await rewardOrder(order);
    expect(r).toEqual({ status: 'sent', amount: 2.4, txId: 'c'.repeat(40) });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ order_key: order.orderKey, rubis_amount: 2.4, tip: 2 }) });
    expect(m.transfer).toHaveBeenCalledWith('alice', 2.4, expect.not.stringContaining('-inno-'), 'RUBIS');
    expect(m.update).toHaveBeenCalledWith({ where: { order_key: order.orderKey }, data: { status: 'sent', rubis_tx_id: 'c'.repeat(40) } });
  });
  it('writes the ledger row BEFORE broadcasting; a duplicate order key never pays twice', async () => {
    m.create.mockRejectedValue(new Error('unique violation'));
    expect(await rewardOrder(order)).toEqual({ status: 'skipped', reason: 'already rewarded' });
    expect(m.transfer).not.toHaveBeenCalled();
  });
  it('skips guests, vendors paying themselves, and spokes without a rate', async () => {
    expect((await rewardOrder({ ...order, customerAccount: undefined })).status).toBe('skipped');
    expect((await rewardOrder({ ...order, customerAccount: 'millewee' })).status).toBe('skipped');
    m.findFirst.mockResolvedValue(spoke({ rubis_rate: null }));
    expect((await rewardOrder(order)).status).toBe('skipped');
    m.findFirst.mockResolvedValue(null);
    expect((await rewardOrder(order)).status).toBe('skipped');
    expect(m.transfer).not.toHaveBeenCalled();
  });
  it('passes RUBIS spent through: only the fiat-paid part accrues', async () => {
    const r = await rewardOrder({ ...order, orderTotal: 100, memo: 'd:1 TABLE 4 kcs-inno-ab12-cd34', rubisSpent: 25 });
    expect(r).toMatchObject({ status: 'sent', amount: 7.5 });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rubis_spent: 25, rubis_amount: 7.5 }) });
  });
  it('records a failed transfer and never throws', async () => {
    m.transfer.mockRejectedValue(new Error('node down'));
    expect(await rewardOrder(order)).toEqual({ status: 'failed', reason: 'node down' });
    expect(m.update).toHaveBeenCalledWith({ where: { order_key: order.orderKey }, data: { status: 'failed', error: 'node down' } });
  });
});
