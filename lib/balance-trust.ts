// After a Stripe payment the hub knows the new balance before Hive-Engine shows it: the webhook
// transfers the EURO, then indexing trails by several seconds. /user reads the chain on load, so
// without this it overwrote the known balance with a stale one (a new account showed 0.00 € until
// a manual refresh, found 2026-11-07). During the trust window /user keeps the cached value.

export const BALANCE_KEY = 'innopay_lastBalance';
export const BALANCE_TIMESTAMP_KEY = 'innopay_lastBalance_timestamp';
export const TRUST_UNTIL_KEY = 'innopay_balance_trustUntil';
export const TRUST_WINDOW_MS = 60 * 1000;

/** Store the balance the hub just computed and tell /user to trust it for the next minute. */
export function seedTrustedBalance(
  storage: Pick<Storage, 'setItem'>,
  balance: number,
  now: number = Date.now(),
): void {
  storage.setItem(BALANCE_KEY, balance.toFixed(2));
  storage.setItem(BALANCE_TIMESTAMP_KEY, String(now));
  storage.setItem(TRUST_UNTIL_KEY, String(now + TRUST_WINDOW_MS));
}

/**
 * Balance of an account just created and loaded through Stripe: the credential session's figure
 * (amount + any campaign bonus). Falls back to the amount charged if the session gave nothing usable.
 */
export function newAccountBalance(sessionBalance: unknown, amountParam: string | null): number | null {
  const fromSession = Number(sessionBalance);
  if (Number.isFinite(fromSession) && fromSession > 0) return fromSession;
  const charged = amountParam === null ? NaN : parseFloat(amountParam);
  return Number.isFinite(charged) && charged > 0 ? charged : null;
}
