import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  db: { walletuser: { findFirst: vi.fn() }, innouser: { findUnique: vi.fn() }, email_verification: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.db }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { POST } from './route';

const now = new Date('2026-10-23T10:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.db.innouser.findUnique.mockResolvedValue({ id: 7 });
  mocks.db.email_verification.count.mockResolvedValue(0);
  mocks.db.email_verification.findFirst.mockResolvedValue(null);
  mocks.db.email_verification.create.mockImplementation(async ({ data }) => ({ ...data, id: 'verification-test', created_at: now, verified: false, verified_at: null, attempts: 0 }));
  mocks.send.mockResolvedValue({ data: { id: 'email-test' }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('logs creation and email acceptance with the persisted expiry and no OTP', async () => {
  const response = await POST(new NextRequest('https://wallet.innopay.lu/api/verify/request-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', language: 'en' }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ found: true, expiresIn: 600 });
  const sentCode = mocks.db.email_verification.create.mock.calls[0][0].data.code;
  expect(mocks.send.mock.calls[0][0].text).toContain(sentCode);
  const traceCalls = vi.mocked(console.warn).mock.calls.filter(call => call[0] === '[VERIFY TRACE]');
  const traces = traceCalls.map(call => JSON.parse(String(call[1])));
  for (const event of ['request_created', 'request_email_sent']) {
    expect(traces).toContainEqual(expect.objectContaining({ event, verificationId: 'verification-test', expiresAt: '2026-10-23T10:10:00.000Z', expiresInSeconds: 600 }));
  }
  expect(JSON.stringify([vi.mocked(console.log).mock.calls, vi.mocked(console.warn).mock.calls])).not.toContain(sentCode);
});

const targetedRequest = (accountName = '@HATCH-TEST') => new NextRequest('https://wallet.innopay.lu/api/verify/request-code', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', accountName }),
});

it('offers manual keys when the requested account is absent or has no matching email relation', async () => {
  mocks.db.walletuser.findFirst.mockResolvedValue(null);
  const response = await POST(targetedRequest());
  expect(await response.json()).toEqual({ found: false, manualImport: true });
  expect(mocks.db.walletuser.findFirst).toHaveBeenCalledWith({
    where: { accountName: 'hatch-test', innouser: { is: { email: 'user@example.com' } } }, select: { userId: true },
  });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.db.email_verification.create).not.toHaveBeenCalled();
  // Finding an unrelated wallet by the same email must not send an OTP for it.
  expect(mocks.db.innouser.findUnique).not.toHaveBeenCalled();
});

it('sends an OTP for the requested wallet only when its current email relation matches', async () => {
  mocks.db.walletuser.findFirst.mockResolvedValue({ userId: 42 });
  const response = await POST(targetedRequest());
  expect(await response.json()).toMatchObject({ found: true });
  expect(mocks.db.email_verification.create.mock.calls[0][0].data.user_id).toBe(42);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('rejects malformed target account names before lookup', async () => {
  const response = await POST(targetedRequest('invalid/name'));
  expect(response.status).toBe(400);
  expect(mocks.db.walletuser.findFirst).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
