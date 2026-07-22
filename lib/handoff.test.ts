import { describe, it, expect } from 'vitest';
import { PrivateKey, cryptoUtils } from '@hiveio/dhive';
import { handoffMessage, isFresh, verifyHandoffSignature, HANDOFF_FRESHNESS_MS } from './handoff';

// A deterministic keypair standing in for a customer's ACTIVE key.
const priv = PrivateKey.fromSeed('wallet-handoff-active-test');
const pub = priv.createPublic().toString();

function sign(account: string, ts: number, nonce: string): string {
  return priv.sign(cryptoUtils.sha256(handoffMessage(account, ts, nonce))).toString();
}

describe('verifyHandoffSignature', () => {
  const account = 'test000-000-051';
  const ts = Date.now();
  const nonce = 'abc123';

  it('accepts a signature that recovers to a key in the active authority', () => {
    const sig = sign(account, ts, nonce);
    expect(verifyHandoffSignature(account, ts, nonce, sig, [pub])).toBe(true);
    // also fine when the active authority lists several keys
    const other = PrivateKey.fromSeed('someone-else').createPublic().toString();
    expect(verifyHandoffSignature(account, ts, nonce, sig, [other, pub])).toBe(true);
  });

  it('rejects when the signer key is NOT in the active authority', () => {
    const sig = sign(account, ts, nonce);
    const other = PrivateKey.fromSeed('someone-else').createPublic().toString();
    expect(verifyHandoffSignature(account, ts, nonce, sig, [other])).toBe(false);
  });

  it('rejects a signature over a different account/ts/nonce (no replay/tamper)', () => {
    const sig = sign(account, ts, nonce);
    expect(verifyHandoffSignature('victim', ts, nonce, sig, [pub])).toBe(false);
    expect(verifyHandoffSignature(account, ts + 1, nonce, sig, [pub])).toBe(false);
    expect(verifyHandoffSignature(account, ts, 'other-nonce', sig, [pub])).toBe(false);
  });

  it('fails closed on garbage', () => {
    expect(verifyHandoffSignature(account, ts, nonce, 'not-a-sig', [pub])).toBe(false);
    expect(verifyHandoffSignature(account, ts, nonce, sign(account, ts, nonce), ['not-a-key'])).toBe(false);
  });
});

describe('isFresh', () => {
  it('accepts a recent timestamp', () => {
    const now = 1_000_000_000_000;
    expect(isFresh(now, now)).toBe(true);
    expect(isFresh(now - HANDOFF_FRESHNESS_MS + 1, now)).toBe(true);
  });
  it('rejects an old timestamp', () => {
    const now = 1_000_000_000_000;
    expect(isFresh(now - HANDOFF_FRESHNESS_MS - 1, now)).toBe(false);
  });
  it('rejects an implausibly future-dated timestamp', () => {
    const now = 1_000_000_000_000;
    expect(isFresh(now + 5 * 60 * 1000, now)).toBe(false);
  });
  it('rejects non-finite', () => {
    expect(isFresh(NaN)).toBe(false);
  });
});
