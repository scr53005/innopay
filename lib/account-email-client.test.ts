import { describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import { fetchOwnAccountEmail } from './account-email-client';
import { verifyAccountProof } from './account-proof';

const key = PrivateKey.fromLogin('alice', 'test-only-password', 'active');
const ok = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }) as Response);

describe('fetchOwnAccountEmail', () => {
  it('POSTs a proof the server can verify against the active key', async () => {
    const fetchFn = ok({ found: true, email: 'alice@example.test' });
    expect(await fetchOwnAccountEmail('alice', key.toString(), fetchFn)).toEqual({ found: true, email: 'alice@example.test' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/account/email');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(verifyAccountProof(
      { purpose: 'account-email', account: 'alice', payload: '', ts: body.ts, nonce: body.nonce },
      body.signature, [key.createPublic().toString()],
    )).toBe(true);
  });
  it('reports found:false when the account has no email', async () => {
    expect(await fetchOwnAccountEmail('alice', key.toString(), ok({ found: false }))).toEqual({ found: false, email: undefined });
  });
  it('returns null (unknown) without a key, with an unusable key, or on a refusal', async () => {
    const fetchFn = ok({ found: true, email: 'x@example.test' });
    expect(await fetchOwnAccountEmail('alice', null, fetchFn)).toBeNull();
    expect(await fetchOwnAccountEmail('alice', 'not-a-wif', fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    const refused = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'bad_signature' }) }) as Response);
    expect(await fetchOwnAccountEmail('alice', key.toString(), refused)).toBeNull();
  });
});
