import { PublicKey, Signature, cryptoUtils } from '@hiveio/dhive';

// Hub-side verification of a spoke wallet hand-off. Pure crypto + the constants,
// which MUST match innohatch/lib/innopay/handoff.ts byte-for-byte. See that file
// for the full rationale. The DB replay-guard + on-chain fetch live in the server
// action; this is just the message format, freshness, and signature check.

const HANDOFF_PREFIX = 'innopay-wallet-handoff';
export const HANDOFF_FRESHNESS_MS = 2 * 60 * 1000; // reject challenges older than 2 min
const CLOCK_SKEW_MS = 60 * 1000; // tolerate 1 min of future-dated skew

/** Rebuild the exact signed string (identical to the spoke's handoffMessage). */
export function handoffMessage(account: string, ts: number, nonce: string): string {
  return `${HANDOFF_PREFIX}:${account}:${ts}:${nonce}`;
}

/** Is the timestamp within the freshness window (and not implausibly future-dated)? */
export function isFresh(ts: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= -CLOCK_SKEW_MS && age <= HANDOFF_FRESHNESS_MS;
}

/**
 * Does `sig` over the challenge recover to a public key that appears in the
 * account's on-chain ACTIVE authority key_auths? Proof the signer holds the
 * active key. `activeKeyAuths` = the account's active.key_auths (pubkey strings).
 * Fail-closed on any malformed input.
 */
export function verifyHandoffSignature(
  account: string,
  ts: number,
  nonce: string,
  sig: string,
  activeKeyAuths: string[],
): boolean {
  try {
    const digest = cryptoUtils.sha256(handoffMessage(account, ts, nonce));
    const recovered = Signature.fromString(sig).recover(digest).toString();
    return activeKeyAuths.some((k) => PublicKey.fromString(k).toString() === recovered);
  } catch {
    return false;
  }
}
