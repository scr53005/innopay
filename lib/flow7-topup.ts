// Flow 7 (top-up and pay): the customer's wallet is short for the order, so the hub charges a
// top-up on Stripe and then pays the order from balance + top-up.
//
// The top-up must cover the shortfall. Until 2026-11-07 the hub suggested a sufficient amount
// (rounded up to 5 €) but let the customer type a smaller one: with 8.17 € for a 23.85 € order the
// suggestion was 20 €, yet 15 € went through to Stripe, and the order could not be covered.
// Pure: used by the top-up page (live check) and /api/checkout/account (the real gate).

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Amount missing to pay the order (never negative). */
export function flow7Deficit(balance: number, orderAmount: number): number {
  return Math.max(0, round2(orderAmount - balance));
}

/** Smallest top-up the page accepts: whole euros (the input steps by 1), never below the floor. */
export function minimumFlow7Topup(deficit: number, floor: number): number {
  return Math.max(floor, Math.ceil(round2(deficit)));
}

/** Pre-filled suggestion: the deficit rounded up to the next increment (5 € in EUR), at least the floor. */
export function suggestedFlow7Topup(deficit: number, floor: number, increment = 5): number {
  return Math.max(floor, Math.ceil(Math.ceil(round2(deficit)) / increment) * increment);
}

/** How much the top-up still lacks to pay the order; 0 when it is enough. Compared in cents. */
export function flow7Shortfall(topup: number, balance: number, orderAmount: number): number {
  return Math.max(0, round2(orderAmount - balance - topup));
}
