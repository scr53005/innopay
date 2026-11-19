import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  checkAccountProof: vi.fn(),
  fetchEngineHistory: vi.fn(),
  db: { spoke_account: { findMany: vi.fn() }, order_payer: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.db }));
vi.mock('@/lib/account-proof-server', () => ({ checkAccountProof: mocks.checkAccountProof }));
vi.mock('@/lib/history/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/history/load')>()),
  fetchEngineHistory: mocks.fetchEngineHistory,
}));
import { POST } from './route';

const me = 'inno000-000-025';
const request = (body: Record<string, unknown>) => new NextRequest('https://wallet.innopay.lu/api/history', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: me, ts: 1, nonce: 'abcdef0123456789', signature: 'sig', ...body }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.checkAccountProof.mockResolvedValue({ ok: true });
  mocks.fetchEngineHistory.mockResolvedValue([{
    operation: 'tokens_transfer', from: me, to: 'innopay', symbol: 'EURO', quantity: '3.51',
    memo: 'kcs-inno-lwt4-drol', timestamp: 1773342534, transactionId: 'tx1',
  }]);
  mocks.db.spoke_account.findMany.mockResolvedValue([{ hive_account: 'indies.cafe', spoke: { id: 'indies', name: 'Indies' } }]);
  mocks.db.order_payer.findMany.mockResolvedValue([{ reference: 'kcs-inno-lwt4-drol', recipient: 'indies.cafe' }]);
});

it('refuses without a history proof and reads nothing', async () => {
  mocks.checkAccountProof.mockResolvedValue({ ok: false, status: 401, error: 'bad_signature' });
  const res = await POST(request({}));
  expect(res.status).toBe(401);
  expect(mocks.checkAccountProof.mock.calls[0][0]).toMatchObject({ purpose: 'history', account: me, payload: '' });
  expect(mocks.fetchEngineHistory).not.toHaveBeenCalled();
  expect(mocks.db.order_payer.findMany).not.toHaveBeenCalled();
});

it('returns classified movements, the shop named through the caller’s own order_payer rows', async () => {
  const res = await POST(request({ offset: 0 }));
  const body = await res.json();
  expect(body.movements[0]).toMatchObject({ kind: 'order', amount: -3.51, shop: { id: 'indies', name: 'Indies' } });
  expect(body.nextOffset).toBeNull();
  expect(mocks.db.order_payer.findMany.mock.calls[0][0].where).toEqual({ customer_account: me, reference: { in: ['kcs-inno-lwt4-drol'] } });
});

it('rejects a bad offset and reports Hive-Engine trouble as 503', async () => {
  expect((await POST(request({ offset: -1 }))).status).toBe(400);
  expect((await POST(request({ offset: 1.5 }))).status).toBe(400);
  mocks.fetchEngineHistory.mockRejectedValue(new Error('hive-engine history: 502'));
  const res = await POST(request({}));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: 'history_unavailable' });
});
