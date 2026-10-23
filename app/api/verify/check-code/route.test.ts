import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  email_verification: { findFirst: vi.fn(), update: vi.fn() },
  innouser: { findUnique: vi.fn(), update: vi.fn() },
  walletuser: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ default: db }));
import { POST } from './route';

const now = new Date('2026-10-23T10:01:00Z');
const fresh = {
  id: 'verification-test', user_id: 7, email: 'user@example.com', code: '123456',
  created_at: new Date('2026-10-23T10:00:00Z'), expires_at: new Date('2026-10-23T10:10:00Z'),
  verified: false, verified_at: null, attempts: 0,
};
const request = (code = fresh.code, accountName?: string) => new NextRequest('https://wallet.innopay.lu/api/verify/check-code', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://innohatch.vercel.app' },
  body: JSON.stringify({ email: ' USER@example.com ', code, accountName }),
});
function traces() {
  return vi.mocked(console.warn).mock.calls.filter(call => call[0] === '[VERIFY TRACE]').map(call => JSON.parse(String(call[1])));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ result: [] }), { status: 200 })));
  db.email_verification.findFirst.mockResolvedValue(fresh);
  db.email_verification.update.mockResolvedValue({ ...fresh, verified: true, verified_at: now });
  db.innouser.findUnique.mockResolvedValue({ id: 7 });
  db.innouser.update.mockResolvedValue({ id: 7, verified: true });
  db.walletuser.findMany.mockResolvedValue([
    { accountName: 'hatch-test', creationDate: now, masterPassword: null, seed: null },
    { accountName: 'inno000-000-002', creationDate: now, masterPassword: null, seed: null },
  ]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('verification endpoint diagnostics', () => {
  it('accepts a fresh code and records the transition to consumed without logging the code', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, single: false, accounts: [{ accountName: 'hatch-test' }, { accountName: 'inno000-000-002' }] });
    expect(db.email_verification.update).toHaveBeenCalledWith({ where: { id: fresh.id }, data: { verified: true, verified_at: now } });
    expect(traces()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'check_pending', verificationId: fresh.id, reason: 'pending', expiresInSeconds: 540 }),
      expect.objectContaining({ event: 'check_consumed', verificationId: fresh.id, accountsCount: 2 }),
      expect.objectContaining({ event: 'check_response', single: false, accountsCount: 2 }),
    ]));
    expect(JSON.stringify([vi.mocked(console.log).mock.calls, vi.mocked(console.warn).mock.calls])).not.toContain(fresh.code);
  });
  it.each([
    ['missing', null],
    ['already_used', { ...fresh, verified: true, verified_at: now }],
    ['expired', { ...fresh, expires_at: now }],
    ['attempt_limit', { ...fresh, attempts: 3, expires_at: now }],
  ])('diagnoses %s without accepting an unavailable code', async (reason, latest) => {
    db.email_verification.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(latest);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false });
    expect(traces()).toContainEqual(expect.objectContaining({ event: 'check_unavailable', reason }));
    expect(db.email_verification.findFirst.mock.calls[1][0].select).not.toHaveProperty('code');
    expect(db.walletuser.findMany).not.toHaveBeenCalled();
    expect(db.email_verification.update).not.toHaveBeenCalled();
  });
  it('keeps the original rejection if the additional diagnostic lookup fails', async () => {
    db.email_verification.findFirst.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('diagnostic lookup unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(traces()).toContainEqual(expect.objectContaining({ event: 'check_diagnostic_failed' }));
    expect(db.email_verification.update).not.toHaveBeenCalled();
  });
  it('still increments incorrect-code attempts and does not return accounts', async () => {
    const response = await POST(request('654321'));
    expect(response.status).toBe(400);
    expect(db.email_verification.update).toHaveBeenCalledWith({ where: { id: fresh.id }, data: { attempts: 1 } });
    expect(db.walletuser.findMany).not.toHaveBeenCalled();
    expect(traces()).toContainEqual(expect.objectContaining({ event: 'check_incorrect', attempts: 1 }));
  });
});

it('rechecks account, verified user and current email together before returning targeted credentials', async () => {
  db.walletuser.findMany.mockResolvedValueOnce([
    { accountName: 'hatch-test', creationDate: now, masterPassword: 'synthetic-test-master', seed: null },
  ]);
  const response = await POST(request(fresh.code, '@HATCH-TEST'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, single: true, accountName: 'hatch-test' });
  expect(db.walletuser.findMany).toHaveBeenCalledWith({
    where: { accountName: 'hatch-test', userId: 7, innouser: { is: { email: 'user@example.com' } } },
    orderBy: { creationDate: 'desc' },
  });
});

it('does not return another wallet after a valid code if the requested account is not linked', async () => {
  db.walletuser.findMany.mockResolvedValueOnce([]);
  const response = await POST(request(fresh.code, 'hatch-test'));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ success: false, manualImport: true });
  expect(db.email_verification.update).not.toHaveBeenCalled();
});

it('offers manual keys if the requested account has no recoverable key material', async () => {
  db.walletuser.findMany.mockResolvedValueOnce([
    { accountName: 'hatch-test', creationDate: now, masterPassword: null, seed: null },
  ]);
  const response = await POST(request(fresh.code, 'hatch-test'));
  expect(await response.json()).toMatchObject({ success: false, manualImport: true });
  expect(db.email_verification.update).not.toHaveBeenCalled();
});
