import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  checkAccountProof: vi.fn(),
  db: {
    walletuser: { findUnique: vi.fn() },
    innouser: { findFirst: vi.fn() },
    email_verification: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.db }));
vi.mock('@/lib/account-proof-server', () => ({ checkAccountProof: mocks.checkAccountProof }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { POST } from './route';

const now = new Date('2026-11-19T10:00:00Z');
const request = (body: Record<string, unknown>) => new NextRequest('https://wallet.innopay.lu/api/email-change/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'inno000-000-025', ts: now.getTime(), nonce: 'abcdef0123456789', signature: 'sig', language: 'fr', ...body }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.checkAccountProof.mockResolvedValue({ ok: true });
  mocks.db.walletuser.findUnique.mockResolvedValue({ userId: 7, innouser: { email: 'dead@old-provider.com' } });
  mocks.db.innouser.findFirst.mockResolvedValue(null);
  mocks.db.email_verification.count.mockResolvedValue(0);
  mocks.db.email_verification.findFirst.mockResolvedValue(null);
  mocks.db.email_verification.create.mockImplementation(async ({ data }) => ({ ...data, id: 'ver-1' }));
  mocks.send.mockResolvedValue({ data: { id: 'mail-1' }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('signs for the NORMALIZED new email and mails an email-change code to it', async () => {
  const response = await POST(request({ newEmail: ' Anthony.Mansour0@Gmail.com ' }));
  expect(response.status).toBe(200);
  expect(mocks.checkAccountProof.mock.calls[0][0]).toMatchObject({
    purpose: 'email-change', account: 'inno000-000-025', payload: 'anthony.mansour0@gmail.com',
  });
  const created = mocks.db.email_verification.create.mock.calls[0][0].data;
  expect(created).toMatchObject({ user_id: 7, email: 'anthony.mansour0@gmail.com', purpose: 'email-change' });
  expect(created.code).toMatch(/^\d{6}$/);
  expect(mocks.send.mock.calls[0][0].to).toBe('anthony.mansour0@gmail.com');
  expect(mocks.send.mock.calls[0][0].text).toContain(created.code);
});

it('allows re-setting a capitalized stored address to its lowercase form', async () => {
  mocks.db.walletuser.findUnique.mockResolvedValue({ userId: 7, innouser: { email: 'Anthony.Mansour0@gmail.com' } });
  mocks.db.innouser.findFirst.mockResolvedValue({ id: 7 }); // the case-insensitive owner is this same user
  const response = await POST(request({ newEmail: 'anthony.mansour0@gmail.com' }));
  expect(response.status).toBe(200);
});

it('does nothing without a valid wallet proof', async () => {
  mocks.checkAccountProof.mockResolvedValue({ ok: false, status: 401, error: 'bad_signature' });
  const response = await POST(request({ newEmail: 'new@example.com' }));
  expect(response.status).toBe(401);
  expect(mocks.db.email_verification.create).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('refuses an address that belongs to another Innopay user', async () => {
  mocks.db.innouser.findFirst.mockResolvedValue({ id: 99 });
  const response = await POST(request({ newEmail: 'taken@example.com' }));
  expect(response.status).toBe(409);
  expect(mocks.send).not.toHaveBeenCalled();
});

it('refuses wallets not linked to an Innopay user, and the unchanged address', async () => {
  mocks.db.walletuser.findUnique.mockResolvedValueOnce({ userId: null, innouser: null });
  expect((await POST(request({ newEmail: 'new@example.com' }))).status).toBe(404);
  mocks.db.walletuser.findUnique.mockResolvedValueOnce({ userId: 7, innouser: { email: 'same@example.com' } });
  expect((await POST(request({ newEmail: 'same@example.com' }))).status).toBe(400);
});

it('rejects unsendable addresses before checking the proof', async () => {
  const response = await POST(request({ newEmail: 'user​@example.com' }));
  expect(response.status).toBe(400);
  expect(mocks.checkAccountProof).not.toHaveBeenCalled();
});

it('rate-limits per target mailbox', async () => {
  mocks.db.email_verification.count.mockResolvedValue(5);
  expect((await POST(request({ newEmail: 'new@example.com' }))).status).toBe(429);
  mocks.db.email_verification.count.mockResolvedValue(0);
  mocks.db.email_verification.findFirst.mockResolvedValue({ created_at: new Date(now.getTime() - 20_000) });
  const cooled = await POST(request({ newEmail: 'new@example.com' }));
  expect(cooled.status).toBe(429);
  expect(await cooled.json()).toMatchObject({ error: 'cooldown', retryAfter: 40 });
});

it('removes the pending row when Resend refuses without throwing', async () => {
  mocks.send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field: new@example.com' } });
  const response = await POST(request({ newEmail: 'new@example.com' }));
  expect(response.status).toBe(502);
  expect(mocks.db.email_verification.delete).toHaveBeenCalledWith({ where: { id: 'ver-1' } });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('new@example.com');
});
