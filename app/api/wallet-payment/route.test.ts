import { beforeEach, describe, expect, it, vi } from 'vitest';

// Flow 6 leg 2 route: pays the restaurant only against a fresh, unused HUB RECEIPT of leg 1
// (2026-11-03 latency rework — no chain lookup on the critical path).

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), debtCreate: vi.fn(),
  transferHbd: vi.fn(), transferEuro: vi.fn(), getAccounts: vi.fn(), after: vi.fn(),
  spokeOk: vi.fn(),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: m.after }));
vi.mock('@/lib/prisma', () => ({ default: {
  wallet_payment_claim: { findUnique: m.findUnique, updateMany: m.updateMany, update: m.update },
  outstanding_debt: { create: m.debtCreate },
} }));
vi.mock('@/services/hive', () => ({ transferHbd: m.transferHbd, transferEuroTokens: m.transferEuro }));
vi.mock('@/services/currency', () => ({ getUsdPerFiatServerSide: vi.fn(async () => ({ conversion_rate: 1.1 })) }));
vi.mock('@/lib/spoke-currency', () => ({ resolveSpokeCurrency: vi.fn(async () => ({ fiat: 'EUR', iouToken: 'EURO' })) }));
vi.mock('@/lib/farm-payment-guard', () => ({ ArchivedFarmVendorError: class extends Error {}, assertFarmOrderRecipientActive: vi.fn(async () => {}) }));
vi.mock('@/lib/spoke-recipients', () => ({ isActiveSpokeAccount: m.spokeOk }));
vi.mock('@hiveio/dhive', () => ({
  Client: class { database = { getAccounts: m.getAccounts, getDynamicGlobalProperties: vi.fn() }; broadcast = { sendOperations: vi.fn() }; },
  PrivateKey: { fromString: vi.fn() },
}));

import { POST } from './route';

const TX = 'a'.repeat(40);
const body = (over: Record<string, unknown> = {}) => ({
  customerAccount: 'alice', customerTxId: TX, recipient: 'millewee', amountEuro: '3.900',
  orderMemo: 'Bud TABLE 4', distriateSuffix: 'kcs-inno-ab12-cd34', ...over,
});
const call = (b: Record<string, unknown>) => POST(new Request('https://wallet.innopay.lu/api/wallet-payment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}) as never);
const receipt = (over: Record<string, unknown> = {}) => ({
  customer_tx_id: TX, customer_account: 'alice', token_symbol: 'EURO', quantity: '3.900',
  memo: 'Bud TABLE 4 kcs-inno-ab12-cd34', status: 'broadcast', created_at: new Date(), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.spokeOk.mockResolvedValue(true);
  m.findUnique.mockResolvedValue(receipt());
  m.updateMany.mockResolvedValue({ count: 1 });
  m.getAccounts.mockResolvedValue([{ hbd_balance: '100.000 HBD' }]);
  m.transferHbd.mockResolvedValue('b'.repeat(40));
});

describe('POST /api/wallet-payment', () => {
  it('pays the restaurant in HBD against a valid receipt, and defers bookkeeping', async () => {
    const res = await call(body());
    expect(res.status).toBe(200);
    expect(m.transferHbd).toHaveBeenCalledWith('millewee', expect.closeTo(3.9 * 1.1, 6), 'Bud TABLE 4 kcs-inno-ab12-cd34');
    expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'claimed', recipient: 'millewee' } }));
    expect(m.after).toHaveBeenCalledTimes(1); // customer HBD pull + audit happen after the response
  });
  it('refuses a tx id with no hub receipt (forged), without paying', async () => {
    m.findUnique.mockResolvedValue(null);
    expect((await call(body())).status).toBe(403);
    expect(m.transferHbd).not.toHaveBeenCalled();
  });
  it('refuses a replay: receipt already claimed, or lost the atomic claim race', async () => {
    m.findUnique.mockResolvedValue(receipt({ status: 'paid' }));
    expect((await call(body())).status).toBe(403);
    m.findUnique.mockResolvedValue(receipt());
    m.updateMany.mockResolvedValue({ count: 0 });
    expect((await call(body())).status).toBe(409);
    expect(m.transferHbd).not.toHaveBeenCalled();
  });
  it('refuses another customer naming this tx, and unknown recipients', async () => {
    expect((await call(body({ customerAccount: 'mallory' }))).status).toBe(403);
    m.spokeOk.mockResolvedValue(false);
    expect((await call(body({ recipient: 'mallory' }))).status).toBe(403);
    expect(m.transferHbd).not.toHaveBeenCalled();
  });
  it('falls back to the IOU token when innopay is short of HBD', async () => {
    m.getAccounts.mockResolvedValue([{ hbd_balance: '0.500 HBD' }]);
    m.transferEuro.mockResolvedValue('c'.repeat(40));
    expect((await call(body())).status).toBe(200);
    expect(m.transferEuro).toHaveBeenCalledWith('millewee', 3.9, 'Bud TABLE 4 kcs-inno-ab12-cd34', 'EURO');
  });
  it('marks the claim failed (retryable) when the restaurant transfer throws', async () => {
    m.transferHbd.mockRejectedValue(new Error('node down'));
    m.update.mockResolvedValue({});
    expect((await call(body())).status).toBe(500);
    expect(m.update).toHaveBeenCalledWith({ where: { customer_tx_id: TX }, data: { status: 'failed' } });
  });
});
