import { PrivateKey, PublicKey, Signature, cryptoUtils } from '@hiveio/dhive';

// Proof that the caller holds an account's ACTIVE key, for actions on the PERSON behind a
// wallet rather than on an order: changing the recovery email (HUB-USER-FEATURES-PLAN §2),
// reading the account's own email (/api/account/email),
// reading top-up history (§3). Same primitives as lib/order-payment-auth.ts / lib/handoff.ts.
//
// Isomorphic: the browser signs with the key it already holds, the server checks the
// signature against the key published on chain. The purpose and a hash of the payload are
// inside the signed string, so a signature made to set the email to X cannot be replayed to
// set it to Y, nor reused for another purpose. ts + single-use nonce stop replays.

const PREFIX = 'innopay-account-proof:v1';
export const ACCOUNT_PROOF_FRESHNESS_MS = 2 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export type AccountProofPurpose = 'email-change' | 'account-email' | 'history';

export interface AccountProofFields {
  purpose: AccountProofPurpose;
  account: string;
  /** What the action is bound to (the new email for 'email-change'); '' when nothing. */
  payload: string;
  ts: number;
  nonce: string;
}

/** 128 random bits, hex. getRandomValues, not randomUUID (undefined over http on a LAN phone). */
export function newAccountProofNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function accountProofMessage(f: AccountProofFields): string {
  const payloadHash = cryptoUtils.sha256(f.payload).toString('hex');
  return `${PREFIX}:${f.purpose}:${f.account}:${payloadHash}:${f.ts}:${f.nonce}`;
}

/** Client side: sign with the wallet's active private key (WIF). */
export function signAccountProof(f: AccountProofFields, activeKeyWif: string): string {
  return PrivateKey.fromString(activeKeyWif).sign(cryptoUtils.sha256(accountProofMessage(f))).toString();
}

export function isAccountProofFresh(ts: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= -CLOCK_SKEW_MS && age <= ACCOUNT_PROOF_FRESHNESS_MS;
}

/** Server side: does the signature recover to a key in the account's on-chain ACTIVE key_auths? */
export function verifyAccountProof(f: AccountProofFields, signature: string, activeKeyAuths: string[]): boolean {
  try {
    const recovered = Signature.fromString(signature).recover(cryptoUtils.sha256(accountProofMessage(f))).toString();
    return activeKeyAuths.some((k) => PublicKey.fromString(k).toString() === recovered);
  } catch {
    return false;
  }
}
