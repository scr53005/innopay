import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const db = vi.hoisted(() => ({ debts: vi.fn(), payments: vi.fn(), createPayment: vi.fn(), updateDebt: vi.fn(), updateMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: {
  $transaction: async (body: (tx: unknown) => Promise<unknown>) => body({
    outstanding_debt: { findMany: db.debts, update: db.updateDebt, updateMany: db.updateMany },
    debt_payment: { findMany: db.payments, create: db.createPayment },
  }),
} }));

const txId = 'a'.repeat(40);
const body = { action: 'record', account: 'alice', settlement_id: 'run1', debt_ids: ['d1'], phase: 'liquid', amount_hbd: 2, tx_id: txId };
function request(value: unknown = body, authorization = 'Bearer test-key') {
  return new NextRequest('https://wallet.example/api/outstanding-debt/customer-settlement', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LIMAN_API_KEY', 'test-key');
  db.debts.mockResolvedValue([{ id: 'd1', debtor: 'alice', creditor: 'innopay', amount_hbd: 2.522,
    status: 'withdrawal_pending', settlement_id: 'run1' }]);
  db.payments.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('authenticated customer settlement ledger', () => {
  it('records a liquid partial payment exactly once and leaves the savings remainder reserved', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(db.updateDebt).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { amount_hbd: 0.522, status: 'withdrawal_pending' } });
    expect(db.createPayment).toHaveBeenCalledWith({ data: expect.objectContaining({ amount_hbd: 2, settlement_key: 'run1:liquid:d1' }) });
  });
  it('does not decrement a second time when the same phase is retried', async () => {
    db.payments.mockResolvedValue([{ tx_id: txId, notes: JSON.stringify({ payment_hbd: 2 }) }]);
    expect((await POST(request())).status).toBe(200);
    expect(db.createPayment).not.toHaveBeenCalled();
    expect(db.updateDebt).not.toHaveBeenCalled();
  });
  it('rejects a retry with a different amount or transaction ID', async () => {
    db.payments.mockResolvedValue([{ tx_id: txId, notes: JSON.stringify({ payment_hbd: 2 }) }]);
    expect((await POST(request({ ...body, amount_hbd: 1 }))).status).toBe(409);
    expect((await POST(request({ ...body, tx_id: 'b'.repeat(40) }))).status).toBe(409);
  });
  it('rejects debts owned by another workflow and legacy savings withdrawals', async () => {
    db.debts.mockResolvedValue([{ id: 'd1', debtor: 'alice', creditor: 'innopay', amount_hbd: 2.522,
      status: 'withdrawal_pending', settlement_id: 'other' }]);
    expect((await POST(request())).status).toBe(409);
    db.debts.mockResolvedValue([{ id: 'd1', debtor: 'alice', creditor: 'innopay', amount_hbd: 2.522,
      status: 'withdrawal_pending', settlement_id: null }]);
    expect((await POST(request({ ...body, action: 'claim' }))).status).toBe(409);
  });
  it('permits an idempotent claim by its existing workflow', async () => {
    expect((await POST(request({ ...body, action: 'claim' }))).status).toBe(200);
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { settlement_id: 'run1', status: 'withdrawal_pending' } }));
  });
  it('requires authentication and refuses zero or negative payments', async () => {
    expect((await POST(request(body, 'Bearer wrong-key'))).status).toBe(401);
    for (const amount_hbd of [0, -1]) expect((await POST(request({ ...body, amount_hbd }))).status).toBe(400);
    expect(db.createPayment).not.toHaveBeenCalled();
  });
});
