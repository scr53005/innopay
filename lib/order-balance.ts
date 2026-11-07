// Balance a spoke should show right after the hub paid an order from the customer's wallet
// (Flow 5 with an account the hub already knew, which becomes Flow 6). Hive-Engine shows the
// payment only seconds later, so the hub computes it from the balance read just before paying.
// Until 2026-11-07 the hub sent a 0 placeholder and indies showed 0.00 € until its next refresh.

/**
 * @param before   EURO balance read before the payment; null = Hive-Engine unreachable.
 * @param customerPaid  false when the customer → innopay transfer failed (recorded as a debt
 *                      instead), so the wallet still holds the full balance.
 * @returns null when unknown: the spoke then reads the chain rather than show a wrong figure.
 */
export function balanceAfterOrder(before: number | null, orderAmount: number, customerPaid: boolean): number | null {
  if (before === null || !Number.isFinite(before)) return null;
  const after = customerPaid ? before - orderAmount : before;
  return Math.max(0, Math.round(after * 100) / 100);
}
