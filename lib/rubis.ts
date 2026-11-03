// RUBIS reward calculation (RUBIS-PLAN.md §1–4). Pure: no DB, no chain.
//
// The hub — never a spoke — rewards the paying customer from @innopay's RUBIS treasury on each
// paid order, per the spoke's "contract": spoke.rubis_rate (RUBIS per fiat unit spent, e.g. 0.1)
// and spoke.rubis_tip_multiplier (tips earn rate × multiplier, e.g. 2 — waiters are
// prescriptors). Tips are capped at 50 % of the subtotal for the reward, re-applying the spokes'
// own client-side cap (TIP_MAX_FRACTION) because the tip is read from the memo, which the
// client writes. RUBIS precision is 2 decimals; everything is computed in integer hundredths
// (cents of fiat, hundredths of RUBIS, rates in basis points) so 3.30 € × 0.1 gives 0.33, not
// the float 0.32999… → 0.32. Rounded DOWN: 3.58 € × 0.1 = 0.35 RUBIS.
//
// RUBIS spent never earns RUBIS: when part of the bill is paid in RUBIS (1 RUBIS = 1 € at
// redemption), only the fiat-paid part accrues — 100 € bill, 25 paid in RUBIS → 75 € × 0.1 =
// 7.5 RUBIS. A tip can NEVER be paid in RUBIS (rule, 2026-11-03 — it is the waiter's money):
// RUBIS only ever pay the food, so rubisSpent is clamped to the food subtotal here, and the
// redemption planner (lib/rubis-redemption.ts) never applies RUBIS to the tip.

export const TIP_MAX_FRACTION = 0.5;

/** Tip segment `T:X.XX` (memo rule 4/10). Not to be confused with `T@HHhMM` (dine-in time). */
export function parseTipFromMemo(memo: string | null | undefined): number {
  const m = /(?:^|\s)T:(\d+(?:\.\d{1,2})?)(?=\s|$)/.exec(memo ?? '');
  return m ? Number(m[1]) : 0;
}

const toCents = (x: number) => Math.round(x * 100);
const toBp = (x: number) => Math.round(x * 10_000);

export interface RubisInput {
  orderTotal: number; // fiat actually charged for the order, tip included
  tip: number; // fiat, from the memo (0 when none)
  rate: number; // RUBIS per fiat unit, e.g. 0.1
  tipMultiplier: number; // e.g. 2
  rubisSpent?: number; // RUBIS used to pay part of this order (valued 1:1 with fiat); default 0
}

/** RUBIS earned, in RUBIS (2-decimal value). 0 when nothing is due. */
export function computeRubisReward({ orderTotal, tip, rate, tipMultiplier, rubisSpent = 0 }: RubisInput): number {
  const totalCents = toCents(orderTotal);
  const rateBp = toBp(rate);
  if (totalCents <= 0 || rateBp <= 0) return 0;
  const tipCents = Math.min(Math.max(toCents(tip), 0), totalCents);
  const foodCents = totalCents - tipCents; // the order subtotal, however it was paid
  // RUBIS pay the food first; whatever food was paid in RUBIS earns nothing.
  const rubisCents = Math.min(Math.max(toCents(rubisSpent), 0), foodCents);
  const fiatFoodCents = foodCents - rubisCents;
  // Tip cap is relative to the order subtotal (same rule as the spokes' TIP_MAX_FRACTION).
  const eligibleTipCents = Math.min(tipCents, Math.floor(foodCents * TIP_MAX_FRACTION));
  const multBp = Math.max(toBp(tipMultiplier), 0);
  // hundredths of RUBIS = cents × rate (bp / 10 000), tip part additionally × multiplier.
  const scaled = fiatFoodCents * rateBp * 10_000 + eligibleTipCents * rateBp * multBp;
  const hundredths = Math.floor(scaled / (10_000 * 10_000));
  return hundredths / 100;
}

/**
 * Ledger key for one order's reward: the ORDER, not the payment path — recipient + the order's
 * unique distriate suffix ({tag}-inno-{r4}-{r4}), so one order can never be rewarded twice even
 * if two paths touched it. Falls back to the path key (e.g. 'stripe:<session>') for memos
 * without a proper suffix.
 */
export function rubisOrderKey(recipient: string, memo: string | null | undefined, fallback: string): string {
  const suffix = /(\S+-inno-\S+)/.exec(memo ?? '')?.[1];
  return suffix ? `order:${recipient}:${suffix}`.slice(0, 80) : fallback.slice(0, 80);
}
