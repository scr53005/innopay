import { describe, expect, it } from 'vitest';
import { computeRubisReward, parseTipFromMemo, rubisOrderKey } from './rubis';

const base = { tip: 0, rate: 0.1, tipMultiplier: 2 };

describe('computeRubisReward', () => {
  it('pays rate × amount, rounded DOWN to 2 decimals (the plan example: 3.58 € → 0.35)', () => {
    expect(computeRubisReward({ ...base, orderTotal: 3.58 })).toBe(0.35);
  });
  it('is exact where floats are not (3.30 € → 0.33, not 0.32)', () => {
    expect(computeRubisReward({ ...base, orderTotal: 3.3 })).toBe(0.33);
    expect(computeRubisReward({ ...base, orderTotal: 2.9 })).toBe(0.29);
  });
  it('honours per-spoke rates', () => {
    expect(computeRubisReward({ ...base, orderTotal: 25, rate: 0.05 })).toBe(1.25);
    expect(computeRubisReward({ ...base, orderTotal: 25, rate: 0.2 })).toBe(5);
  });
  it('doubles the rate on the tip', () => {
    // 20 € food + 2 € tip → 2.00 + 0.40
    expect(computeRubisReward({ ...base, orderTotal: 22, tip: 2 })).toBe(2.4);
  });
  it('caps the rewarded tip at 50 % of the subtotal (memo is client-written)', () => {
    // 10 € food + 30 € "tip" → tip rewarded as 5 €: 1.00 + 5 × 0.2 = 2.00 (not 7.00)
    expect(computeRubisReward({ ...base, orderTotal: 40, tip: 30 })).toBe(2);
  });
  it('a tip larger than the total cannot create value', () => {
    expect(computeRubisReward({ ...base, orderTotal: 5, tip: 50 })).toBe(0);
  });
  it('pays nothing below 0.10 € or with no / zero rate', () => {
    expect(computeRubisReward({ ...base, orderTotal: 0.09 })).toBe(0);
    expect(computeRubisReward({ ...base, orderTotal: 10, rate: 0 })).toBe(0);
  });
  it('RUBIS spent earn nothing: 100 € bill, 25 paid in RUBIS → 7.5 RUBIS', () => {
    expect(computeRubisReward({ ...base, orderTotal: 100, rubisSpent: 25 })).toBe(7.5);
  });
  it('with a tip, RUBIS pay the food and the fiat tip still earns double', () => {
    // 90 € food + 10 € tip, 25 RUBIS on the food → 65 € × 0.1 + 10 € × 0.2 = 6.5 + 2 = 8.5
    expect(computeRubisReward({ ...base, orderTotal: 100, tip: 10, rubisSpent: 25 })).toBe(8.5);
  });
  it('a bill paid entirely in RUBIS earns nothing (except a fiat tip)', () => {
    expect(computeRubisReward({ ...base, orderTotal: 30, rubisSpent: 30 })).toBe(0);
    expect(computeRubisReward({ ...base, orderTotal: 33, tip: 3, rubisSpent: 30 })).toBe(0.6);
    expect(computeRubisReward({ ...base, orderTotal: 30, rubisSpent: 999 })).toBe(0);
  });
  it('multiplier 1 = tips earn the normal rate', () => {
    expect(computeRubisReward({ ...base, orderTotal: 22, tip: 2, tipMultiplier: 1 })).toBe(2.2);
  });
});

describe('parseTipFromMemo', () => {
  it('reads the T:X.XX tip segment', () => {
    expect(parseTipFromMemo('d:1,n:c2FucyBzZWw= T:1.50 TABLE 7 kcs-inno-abcd-1234')).toBe(1.5);
    expect(parseTipFromMemo('T:2 TABLE 1 x-inno-a-b')).toBe(2);
  });
  it('does not confuse the dine-in time T@HHhMM, and tolerates no tip', () => {
    expect(parseTipFromMemo('d:1 T@12h30 TABLE 2 x-inno-a-b')).toBe(0);
    expect(parseTipFromMemo('d:1 TABLE 2 x-inno-a-b')).toBe(0);
    expect(parseTipFromMemo(undefined)).toBe(0);
  });
});

describe('rubisOrderKey', () => {
  it('keys on the order (recipient + suffix), not on the payment path', () => {
    expect(rubisOrderKey('millewee', 'd:1 TABLE 4 kcs-inno-ab12-cd34', 'stripe:cs_1')).toBe('order:millewee:kcs-inno-ab12-cd34');
  });
  it('falls back to the path key when the memo has no proper suffix', () => {
    expect(rubisOrderKey('indies.cafe', 'Un serveur est appele -inno-', 'wallet:abc')).toBe('wallet:abc');
    expect(rubisOrderKey('x', undefined, 'direct:t')).toBe('direct:t');
  });
});
