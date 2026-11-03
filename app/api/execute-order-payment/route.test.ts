import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import { signOrderAuth } from '@/lib/order-payment-auth';

// Flow 5 Branch A (existing wallet pays from the hub). Security regressions:
//  - 2026-11-02: anyone could name any account → must prove the ACTIVE key;
//  - 2026-11-03: the hand-over session must never carry the master password / owner / posting keys.

const MASTER = 'test-only-master-password';
const active = PrivateKey.fromLogin('alice', MASTER, 'active');

const m = vi.hoisted(() => ({
  walletuser: vi.fn(), challenge: vi.fn(), sessionCreate: vi.fn(), pay: vi.fn(), getAccounts: vi.fn(), spokeOk: vi.fn(),
  after: vi.fn(), reward: vi.fn(),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: m.after }));
vi.mock('@/lib/rubis-distribute', () => ({ rewardOrder: m.reward }));
vi.mock('@/lib/prisma', () => ({ default: {
  walletuser: { findUnique: m.walletuser },
  handoff_challenge: { create: m.challenge },
  accountCredentialSession: { create: m.sessionCreate },
} }));
vi.mock('@/services/payment-processor', () => ({ processOrderPayment: m.pay }));
vi.mock('@/lib/spoke-recipients', () => ({ isActiveSpokeAccount: m.spokeOk }));
vi.mock('@hiveio/dhive', async (orig) => {
  const real = await orig<typeof import('@hiveio/dhive')>();
  return { ...real, Client: class { database = { getAccounts: m.getAccounts }; } };
});

import { POST } from './route';

const order = { accountName: 'alice', restaurantAccount: 'millewee', orderAmount: 3.9, orderMemo: 'Bud TABLE 4 kcs-inno-ab12-cd34' };
function signed(over: Record<string, unknown> = {}, key = active.toString()) {
  const auth = { ...order, ts: Date.now(), nonce: `n-${Math.random()}` };
  return { ...order, returnUrl: 'https://millewee.innopay.lu/', authTs: auth.ts, authNonce: auth.nonce, authSignature: signOrderAuth(auth, key), ...over };
}
const call = (body: unknown) => POST(new Request('https://wallet.innopay.lu/api/execute-order-payment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never);

beforeEach(() => {
  vi.clearAllMocks();
  m.walletuser.mockResolvedValue({ id: 1, accountName: 'alice', masterPassword: MASTER });
  m.challenge.mockResolvedValue({});
  m.spokeOk.mockResolvedValue(true);
  m.getAccounts.mockResolvedValue([{ active: { key_auths: [[active.createPublic().toString(), 1]] } }]);
  m.pay.mockResolvedValue({ customerEuroTxId: 'x', restaurantHbdTxId: 'y', eurUsdRate: 1.1 });
  m.sessionCreate.mockImplementation(async ({ data }) => ({ id: 'sess-1', ...data }));
});

describe('POST /api/execute-order-payment', () => {
  it('pays when the order is signed with the account active key, and hands over ONLY active + memo', async () => {
    const res = await call(signed());
    expect(res.status).toBe(200);
    expect(m.pay).toHaveBeenCalledTimes(1);
    const { data } = m.sessionCreate.mock.calls[0][0];
    expect(data.activePrivate).toBe(active.toString());
    expect(data.memoPrivate).toBe(PrivateKey.fromLogin('alice', MASTER, 'memo').toString());
    for (const forbidden of ['masterPassword', 'ownerPrivate', 'ownerPublic', 'postingPrivate', 'postingPublic']) {
      expect(data).not.toHaveProperty(forbidden);
    }
    // RUBIS deferred until after the response
    expect(m.reward).not.toHaveBeenCalled();
    await m.after.mock.calls[0][0]();
    expect(m.reward).toHaveBeenCalledWith(expect.objectContaining({
      orderKey: 'order:millewee:kcs-inno-ab12-cd34', customerAccount: 'alice', recipient: 'millewee', orderTotal: 3.9,
    }));
  });
  it('refuses an unsigned request naming a victim account', async () => {
    expect((await call(order)).status).toBe(401);
    expect(m.pay).not.toHaveBeenCalled();
    expect(m.sessionCreate).not.toHaveBeenCalled();
  });
  it('refuses a signature from another key', async () => {
    const other = PrivateKey.fromLogin('mallory', 'x', 'active').toString();
    expect((await call(signed({}, other))).status).toBe(401);
    expect(m.pay).not.toHaveBeenCalled();
  });
  it('refuses a replayed nonce and an unregistered restaurant', async () => {
    m.challenge.mockRejectedValueOnce(new Error('unique violation'));
    expect((await call(signed())).status).toBe(401);
    m.spokeOk.mockResolvedValue(false);
    expect((await call(signed())).status).toBe(403);
    expect(m.pay).not.toHaveBeenCalled();
  });
});
