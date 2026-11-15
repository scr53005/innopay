// The order reference: the unique suffix every order memo ends with ({tag}-inno-{r4}-{r4}, e.g.
// 'kcs-inno-ab12-cd34'). The spoke generates it, the restaurant transfer carries it, and it is
// what links an order to the customer who paid it (lib/order-payer.ts). Pure.

/** Payer lookups go back at most this far: the photo window is 1 h (DISH-PHOTOS-PLAN.md §4). */
export const PAYER_LOOKBACK_MAX_MS = 3 * 60 * 60 * 1000;

/**
 * The reference of an order memo, or null. Same pattern as rubisOrderKey (lib/rubis.ts), so the
 * two keys agree. Waiter calls (bare '-inno-') have none.
 */
export function orderReference(memo: string | null | undefined): string | null {
  const reference = /(\S+-inno-\S+)/.exec(memo ?? '')?.[1];
  return reference && reference.length <= 40 ? reference : null;
}

/** 'since' query parameter (ISO date) → a date no further back than PAYER_LOOKBACK_MAX_MS. */
export function clampSince(raw: string | null, now: number): Date | null {
  if (!raw) return null;
  const since = Date.parse(raw);
  if (!Number.isFinite(since)) return null;
  return new Date(Math.max(since, now - PAYER_LOOKBACK_MAX_MS));
}
