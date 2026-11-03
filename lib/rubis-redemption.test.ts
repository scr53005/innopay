import { describe, expect, it } from 'vitest';
import { planRubisPayment } from './rubis-redemption';

const indies = { tip: 0, maxFraction: 0.25 };

describe('planRubisPayment', () => {
  it("the user's example: 1 RUBIS on a 5 € bill → 1 RUBIS + 4 € (1 < 0.25 × 5)", () => {
    expect(planRubisPayment({ ...indies, orderTotal: 5, rubisBalance: 1 })).toEqual({ rubisToSpend: 1, fiatToPay: 4 });
  });
  it('caps at 25 % of the bill when the balance is larger', () => {
    expect(planRubisPayment({ ...indies, orderTotal: 5, rubisBalance: 2 })).toEqual({ rubisToSpend: 1.25, fiatToPay: 3.75 });
  });
  it('never applies RUBIS to the tip, and the cap ignores the tip', () => {
    // 20 € food + 3 € tip, plenty of RUBIS → cap 5 (25 % of 20), tip fully in fiat
    expect(planRubisPayment({ orderTotal: 23, tip: 3, rubisBalance: 50, maxFraction: 0.25 })).toEqual({ rubisToSpend: 5, fiatToPay: 18 });
  });
  it('honours other spoke policies, including 0 (RUBIS not accepted) and 100 %', () => {
    expect(planRubisPayment({ ...indies, orderTotal: 10, rubisBalance: 9, maxFraction: 0 })).toEqual({ rubisToSpend: 0, fiatToPay: 10 });
    expect(planRubisPayment({ ...indies, orderTotal: 10, rubisBalance: 9, maxFraction: 1 })).toEqual({ rubisToSpend: 9, fiatToPay: 1 });
  });
  it('spends nothing with no RUBIS, and never rounds a balance up', () => {
    expect(planRubisPayment({ ...indies, orderTotal: 10, rubisBalance: 0 })).toEqual({ rubisToSpend: 0, fiatToPay: 10 });
    expect(planRubisPayment({ ...indies, orderTotal: 10, rubisBalance: 0.999 })).toEqual({ rubisToSpend: 0.99, fiatToPay: 9.01 });
  });
  it('stays exact in cents', () => {
    expect(planRubisPayment({ ...indies, orderTotal: 3.3, rubisBalance: 5 })).toEqual({ rubisToSpend: 0.82, fiatToPay: 2.48 });
  });
});
