import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';

vi.mock('./prisma', () => ({ default: {} }));
import { checkAccountProof, type AccountProofDeps } from './account-proof-server';
import { signAccountProof, type AccountProofFields } from './account-proof';

const key = PrivateKey.fromLogin('alice', 'test-password-not-real', 'active');
const now = 1_800_000_000_000;
const fields: AccountProofFields = { purpose: 'email-change', account: 'alice', payload: 'new@example.com', ts: now, nonce: 'abcdef0123456789' };
const sig = signAccountProof(fields, key.toString());

let claimed: Set<string>;
let deps: AccountProofDeps;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  claimed = new Set();
  deps = {
    claimNonce: vi.fn(async (_account: string, nonce: string) => {
      if (claimed.has(nonce)) throw new Error('P2002');
      claimed.add(nonce);
    }),
    getActiveKeyAuths: vi.fn(async () => [key.createPublic().toString()]),
  };
});

describe('checkAccountProof', () => {
  it('accepts a fresh, unused, correctly signed proof and namespaces the nonce', async () => {
    expect(await checkAccountProof(fields, sig, deps)).toEqual({ ok: true });
    expect(deps.claimNonce).toHaveBeenCalledWith('alice', 'proof:email-change:abcdef0123456789');
  });
  it('refuses a replay of the same proof', async () => {
    await checkAccountProof(fields, sig, deps);
    expect(await checkAccountProof(fields, sig, deps)).toMatchObject({ ok: false, status: 409 });
  });
  it('refuses a stale proof without touching the nonce table or the chain', async () => {
    const stale = { ...fields, ts: now - 5 * 60_000 };
    expect(await checkAccountProof(stale, signAccountProof(stale, key.toString()), deps)).toMatchObject({ ok: false, status: 401 });
    expect(deps.claimNonce).not.toHaveBeenCalled();
    expect(deps.getActiveKeyAuths).not.toHaveBeenCalled();
  });
  it('refuses a signature that does not match the on-chain active key', async () => {
    vi.mocked(deps.getActiveKeyAuths).mockResolvedValue([PrivateKey.fromLogin('alice', 'x', 'active').createPublic().toString()]);
    expect(await checkAccountProof(fields, sig, deps)).toMatchObject({ ok: false, status: 401, error: 'bad_signature' });
  });
  it('reports an unknown account and an unreachable chain distinctly', async () => {
    vi.mocked(deps.getActiveKeyAuths).mockResolvedValueOnce(null);
    expect(await checkAccountProof(fields, sig, deps)).toMatchObject({ status: 404 });
    vi.mocked(deps.getActiveKeyAuths).mockRejectedValueOnce(new Error('timeout'));
    expect(await checkAccountProof({ ...fields, nonce: 'abcdef0123456780' }, sig, deps)).toMatchObject({ status: 503 });
  });
  it('rejects malformed account names and nonces before any lookup', async () => {
    expect(await checkAccountProof({ ...fields, account: 'Bad/Name' }, sig, deps)).toMatchObject({ status: 400 });
    expect(await checkAccountProof({ ...fields, nonce: 'x:y' }, sig, deps)).toMatchObject({ status: 400 });
    expect(deps.claimNonce).not.toHaveBeenCalled();
  });
});
