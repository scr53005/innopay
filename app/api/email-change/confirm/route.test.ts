import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  db: {
    walletuser: { findUnique: vi.fn() },
    innouser: { findFirst: vi.fn(), update: vi.fn() },
    email_verification: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    email_change: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.db }));
import { POST } from './route';

const now = new Date('2026-11-19T10:00:00Z');
const request = (body: Record<string, unknown>) => new NextRequest('https://wallet.innopay.lu/api/email-change/confirm', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'inno000-000-025', newEmail: 'New@Example.com', code: '123456', ...body }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.db.walletuser.findUnique.mockResolvedValue({ userId: 7, innouser: { email: 'dead@old-provider.com' } });
  mocks.db.email_verification.findFirst.mockResolvedValue({ id: 'ver-1', code: '123456', attempts: 0 });
  mocks.db.innouser.findFirst.mockResolvedValue(null);
  // Each builder returns a marker so the transaction's content can be asserted.
  mocks.db.email_verification.update.mockImplementation((args) => ({ op: 'consume', args }));
  mocks.db.innouser.update.mockImplementation((args) => ({ op: 'set-email', args }));
  mocks.db.email_verification.updateMany.mockImplementation((args) => ({ op: 'revoke', args }));
  mocks.db.email_change.create.mockImplementation((args) => ({ op: 'audit', args }));
  mocks.db.$transaction.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('swaps the email, revokes every other address of this user and audits, in ONE transaction', async () => {
  const response = await POST(request({}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ changed: true, email: 'new@example.com' });

  // Only an 'email-change' code for this user and this (normalized) address can be used.
  expect(mocks.db.email_verification.findFirst.mock.calls[0][0].where).toMatchObject({
    user_id: 7, email: 'new@example.com', purpose: 'email-change', verified: false,
  });
  const ops = mocks.db.$transaction.mock.calls[0][0];
  expect(ops.map((o: { op: string }) => o.op)).toEqual(['consume', 'set-email', 'revoke', 'audit']);
  expect(ops[1].args).toEqual({ where: { id: 7 }, data: { email: 'new@example.com', verified: true } });
  expect(ops[2].args).toEqual({
    where: { user_id: 7, email: { not: 'new@example.com' }, revoked_at: null },
    data: { revoked_at: now },
  });
  expect(ops[3].args.data).toMatchObject({
    user_id: 7, account_name: 'inno000-000-025', old_email: 'dead@old-provider.com', new_email: 'new@example.com', method: 'signed',
  });
});

it('counts wrong codes and expires the code at the third', async () => {
  const first = await POST(request({ code: '000000' }));
  expect(first.status).toBe(400);
  expect(await first.json()).toEqual({ error: 'wrong_code', attemptsLeft: 2 });
  expect(mocks.db.email_verification.update).toHaveBeenCalledWith({ where: { id: 'ver-1' }, data: { attempts: 1 } });

  mocks.db.email_verification.findFirst.mockResolvedValue({ id: 'ver-1', code: '123456', attempts: 2 });
  const third = await POST(request({ code: '000000' }));
  expect(third.status).toBe(429);
  expect(mocks.db.email_verification.update).toHaveBeenLastCalledWith({ where: { id: 'ver-1' }, data: { attempts: 3, expires_at: now } });
  expect(mocks.db.$transaction).not.toHaveBeenCalled();
});

it('has nothing to confirm without a pending email-change code', async () => {
  mocks.db.email_verification.findFirst.mockResolvedValue(null);
  expect((await POST(request({}))).status).toBe(404);
  expect(mocks.db.$transaction).not.toHaveBeenCalled();
});

it('refuses if another user took the address meanwhile (pre-check and unique violation)', async () => {
  mocks.db.innouser.findFirst.mockResolvedValueOnce({ id: 99 });
  expect((await POST(request({}))).status).toBe(409);
  mocks.db.$transaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
  expect((await POST(request({}))).status).toBe(409);
});

it('validates input before any lookup', async () => {
  expect((await POST(request({ code: '12ab' }))).status).toBe(400);
  expect((await POST(request({ account: 'Bad/Name' }))).status).toBe(400);
  expect(mocks.db.walletuser.findUnique).not.toHaveBeenCalled();
});
