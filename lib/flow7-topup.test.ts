import { describe, expect, it } from 'vitest';
import { flow7Deficit, flow7Shortfall, minimumFlow7Topup, suggestedFlow7Topup } from './flow7-topup';

// The case found 2026-11-07: 8.17 € in the wallet, order 23.85 €.
const BALANCE = 8.17;
const ORDER = 23.85;

describe('Flow 7 top-up', () => {
  it('deficit in cents, no float noise', () => {
    expect(flow7Deficit(BALANCE, ORDER)).toBe(15.68);
    expect(flow7Deficit(30, ORDER)).toBe(0);
  });

  it('suggestion: deficit rounded up to 5 €, at least 15 €', () => {
    expect(suggestedFlow7Topup(15.68, 15)).toBe(20);
    expect(suggestedFlow7Topup(2.1, 15)).toBe(15);
    expect(suggestedFlow7Topup(20, 15)).toBe(20);
  });

  it('minimum accepted: whole euros covering the deficit, at least 15 €', () => {
    expect(minimumFlow7Topup(15.68, 15)).toBe(16);
    expect(minimumFlow7Topup(2.1, 15)).toBe(15);
    expect(minimumFlow7Topup(16, 15)).toBe(16);
  });

  // Regression guard: 15 € was accepted although 8.17 + 15 < 23.85.
  it('15 € is short by 0.68 €; 16 € and the suggested 20 € are enough', () => {
    expect(flow7Shortfall(15, BALANCE, ORDER)).toBe(0.68);
    expect(flow7Shortfall(16, BALANCE, ORDER)).toBe(0);
    expect(flow7Shortfall(20, BALANCE, ORDER)).toBe(0);
  });

  it('exact cover is enough (compared in cents)', () => {
    expect(flow7Shortfall(15.68, BALANCE, ORDER)).toBe(0);
    expect(flow7Shortfall(0.3, 0.1, 0.4)).toBe(0); // 0.1 + 0.3 = 0.30000000000000004 in floats
  });
});
