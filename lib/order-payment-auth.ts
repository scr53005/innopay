import { PrivateKey, PublicKey, Signature, cryptoUtils } from '@hiveio/dhive';

// Proof-of-control for /api/execute-order-payment (Flow 5 Branch A — the hub /user page pays
// an order from an EXISTING wallet). Security fix 2026-11-02: the route used to act on any
// `accountName` in the request body — spend that account's EURO and hand back a credential
// token for its keys. Now the hub page signs the exact order with the account's ACTIVE key
// and the server checks the signature against the key published on chain.
//
// Isomorphic (browser signs, server verifies), same primitives as lib/handoff.ts. The
// signed string binds account + restaurant + amount + memo, so a captured signature cannot
// be re-pointed at another order; ts + single-use nonce stop replays.

const PREFIX = 'innopay-order-payment';
export const ORDER_AUTH_FRESHNESS_MS = 2 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export interface OrderAuthFields {
  accountName: string;
  restaurantAccount: string;
  orderAmount: number;
  orderMemo: string;
  ts: number;
  nonce: string;
}

export function orderAuthMessage(f: OrderAuthFields): string {
  const memoHash = cryptoUtils.sha256(f.orderMemo).toString('hex');
  return `${PREFIX}:${f.accountName}:${f.restaurantAccount}:${f.orderAmount.toFixed(2)}:${memoHash}:${f.ts}:${f.nonce}`;
}

/** Client side: sign with the wallet's active private key (WIF). */
export function signOrderAuth(f: OrderAuthFields, activeKeyWif: string): string {
  return PrivateKey.fromString(activeKeyWif).sign(cryptoUtils.sha256(orderAuthMessage(f))).toString();
}

export function isOrderAuthFresh(ts: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= -CLOCK_SKEW_MS && age <= ORDER_AUTH_FRESHNESS_MS;
}

/** Server side: does the signature recover to a key in the account's on-chain ACTIVE key_auths? */
export function verifyOrderAuth(f: OrderAuthFields, signature: string, activeKeyAuths: string[]): boolean {
  try {
    const recovered = Signature.fromString(signature).recover(cryptoUtils.sha256(orderAuthMessage(f))).toString();
    return activeKeyAuths.some((k) => PublicKey.fromString(k).toString() === recovered);
  } catch {
    return false;
  }
}
