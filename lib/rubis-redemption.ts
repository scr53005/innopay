// Paying part of a bill with RUBIS (RUBIS-PLAN.md §3, policy decided 2026-11-03). Pure.
//
// Rules:
//  1. RUBIS are spent AUTOMATICALLY FIRST when the customer holds any (no prompt).
//  2. Each spoke caps the RUBIS share of a bill: spoke.rubis_max_redeem_fraction, default 0.25,
//     adjustable from the admin back-end.
//  3. A TIP CAN NEVER BE PAID IN RUBIS (it is the waiter's money): RUBIS apply to the food
//     subtotal only, and the cap is a fraction of that subtotal.
//  4. 1 RUBIS = 1 fiat unit at redemption; RUBIS have 2 decimals.
// Example (Indies, 0.25): balance 1 RUBIS, bill 5 € → cap 1.25 → 1 RUBIS + 4 € in HBD.
// The RUBIS spent then earn no new RUBIS (computeRubisReward's rubisSpent).

export const DEFAULT_MAX_REDEEM_FRACTION = 0.25;

export interface RedemptionInput {
  orderTotal: number; // fiat, tip included
  tip: number; // fiat (never payable in RUBIS)
  rubisBalance: number; // customer's liquid RUBIS
  maxFraction: number; // spoke policy, 0..1
}

export interface RedemptionPlan {
  rubisToSpend: number; // RUBIS (= fiat value) applied to the food
  fiatToPay: number; // the rest: food remainder + the whole tip
}

const toCents = (x: number) => Math.round(x * 100);

export function planRubisPayment({ orderTotal, tip, rubisBalance, maxFraction }: RedemptionInput): RedemptionPlan {
  const totalCents = Math.max(toCents(orderTotal), 0);
  const tipCents = Math.min(Math.max(toCents(tip), 0), totalCents);
  const foodCents = totalCents - tipCents;
  const fractionBp = Math.min(Math.max(Math.round(maxFraction * 10_000), 0), 10_000);
  const capCents = Math.floor((foodCents * fractionBp) / 10_000);
  const balanceCents = Math.max(Math.floor(rubisBalance * 100 + 1e-6), 0); // never round a balance UP
  const rubisCents = Math.min(balanceCents, capCents);
  return { rubisToSpend: rubisCents / 100, fiatToPay: (totalCents - rubisCents) / 100 };
}
