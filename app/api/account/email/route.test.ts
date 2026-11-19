import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  checkAccountProof: vi.fn(),
  db: { walletuser: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.db }));
vi.mock('@/lib/account-proof-server', () => ({ checkAccountProof: mocks.checkAccountProof }));
import { GET, POST } from './route';

const request = (body: Record<string, unknown>) => new NextRequest('https://wallet.innopay.lu/api/account/email', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'inno000-000-025', ts: 1, nonce: 'abcdef0123456789', signature: 'sig', ...body }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.checkAccountProof.mockResolvedValue({ ok: true });
  mocks.db.walletuser.findUnique.mockResolvedValue({ innouser: { email: 'anthony@example.com' } });
});

// Regression guard (2026-11-19): the endpoint used to hand out any account's email for its name.
it('no longer answers the unauthenticated GET', async () => {
  const res = await GET();
  expect(res.status).toBe(410);
  expect(mocks.db.walletuser.findUnique).not.toHaveBeenCalled();
});

it('checks an account-email proof with an empty payload, for the normalized account', async () => {
  await POST(request({ account: ' @Inno000-000-025 ' }));
  expect(mocks.checkAccountProof).toHaveBeenCalledWith(
    { purpose: 'account-email', account: 'inno000-000-025', payload: '', ts: 1, nonce: 'abcdef0123456789' }, 'sig',
  );
});

it('refuses without a valid proof and never reads the database', async () => {
  mocks.checkAccountProof.mockResolvedValue({ ok: false, status: 401, error: 'bad_signature' });
  const res = await POST(request({}));
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'bad_signature' });
  expect(mocks.db.walletuser.findUnique).not.toHaveBeenCalled();
});

it('returns the caller’s own email once proven', async () => {
  const res = await POST(request({}));
  expect(await res.json()).toEqual({ found: true, email: 'anthony@example.com' });
  expect(mocks.db.walletuser.findUnique.mock.calls[0][0].where).toEqual({ accountName: 'inno000-000-025' });
});

it('answers found:false for a wallet Innopay did not create', async () => {
  mocks.db.walletuser.findUnique.mockResolvedValue(null);
  const res = await POST(request({}));
  expect(await res.json()).toEqual({ found: false });
});
