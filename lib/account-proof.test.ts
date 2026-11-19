import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import {
  isAccountProofFresh, newAccountProofNonce, signAccountProof, verifyAccountProof, type AccountProofFields,
} from './account-proof';

const key = PrivateKey.fromLogin('alice', 'test-password-not-real', 'active');
const otherKey = PrivateKey.fromLogin('mallory', 'another-password', 'active');
const keyAuths = [key.createPublic().toString()];

const fields: AccountProofFields = {
  purpose: 'email-change',
  account: 'alice',
  payload: 'new@example.com',
  ts: 1_800_000_000_000,
  nonce: 'n-1',
};

describe('account proof', () => {
  it('verifies a signature made with the account active key', () => {
    expect(verifyAccountProof(fields, signAccountProof(fields, key.toString()), keyAuths)).toBe(true);
  });
  it('refuses a signature from another key (anyone naming a public account)', () => {
    expect(verifyAccountProof(fields, signAccountProof(fields, otherKey.toString()), keyAuths)).toBe(false);
  });
  it('refuses a valid signature re-pointed at another email, purpose, account or nonce', () => {
    const sig = signAccountProof(fields, key.toString());
    expect(verifyAccountProof({ ...fields, payload: 'attacker@example.com' }, sig, keyAuths)).toBe(false);
    expect(verifyAccountProof({ ...fields, purpose: 'history' }, sig, keyAuths)).toBe(false);
    expect(verifyAccountProof({ ...fields, account: 'bob' }, sig, keyAuths)).toBe(false);
    expect(verifyAccountProof({ ...fields, nonce: 'n-2' }, sig, keyAuths)).toBe(false);
    expect(verifyAccountProof({ ...fields, ts: fields.ts + 1 }, sig, keyAuths)).toBe(false);
  });
  it('refuses garbage signatures and garbage keys', () => {
    expect(verifyAccountProof(fields, 'not-a-signature', keyAuths)).toBe(false);
    expect(verifyAccountProof(fields, signAccountProof(fields, key.toString()), ['not-a-key'])).toBe(false);
  });
  it('enforces freshness, with a little future skew', () => {
    const now = fields.ts;
    expect(isAccountProofFresh(now - 60_000, now)).toBe(true);
    expect(isAccountProofFresh(now - 3 * 60_000, now)).toBe(false);
    expect(isAccountProofFresh(now + 30_000, now)).toBe(true);
    expect(isAccountProofFresh(now + 2 * 60_000, now)).toBe(false);
    expect(isAccountProofFresh(Number.NaN, now)).toBe(false);
  });
  it('makes distinct 32-hex nonces', () => {
    const a = newAccountProofNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newAccountProofNonce()).not.toBe(a);
  });
});
