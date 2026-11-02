import { describe, expect, it } from 'vitest';
import { checkReceipt, RECEIPT_MAX_AGE_MS, type LegReceipt } from './leg-receipt';

const now = Date.UTC(2026, 10, 3, 12, 0, 0);
const expected = { customerAccount: 'alice', tokenSymbol: 'EURO', amount: 3.58, distriateSuffix: 'kcs-inno-ab12-cd34' };
const receipt = (over: Partial<LegReceipt> = {}): LegReceipt => ({
  customer_account: 'alice', token_symbol: 'EURO', quantity: '3.580', memo: 'Bud TABLE 4 kcs-inno-ab12-cd34',
  status: 'broadcast', created_at: new Date(now - 5_000), ...over,
});

describe('checkReceipt', () => {
  it('accepts the hub receipt of this order', () => {
    expect(checkReceipt(receipt(), expected, now)).toEqual({ ok: true });
  });
  it('accepts a retry of a failed claim, and Prisma Decimal-like quantities', () => {
    expect(checkReceipt(receipt({ status: 'failed' }), expected, now).ok).toBe(true);
    expect(checkReceipt(receipt({ quantity: { toString: () => '3.58' } }), expected, now).ok).toBe(true);
  });
  it('refuses a tx id the hub never broadcast (forged / random)', () => {
    expect(checkReceipt(null, expected, now).ok).toBe(false);
  });
  it('refuses a receipt already used (replay)', () => {
    expect(checkReceipt(receipt({ status: 'claimed' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ status: 'paid' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ status: 'unbacked' }), expected, now).ok).toBe(false);
  });
  it('refuses another customer, token, a smaller amount, another order', () => {
    expect(checkReceipt(receipt({ customer_account: 'mallory' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ token_symbol: 'LEI' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ quantity: '0.010' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ memo: 'other kcs-inno-zz99-zz99' }), expected, now).ok).toBe(false);
    expect(checkReceipt(receipt({ memo: null }), expected, now).ok).toBe(false);
  });
  it('refuses a stale receipt', () => {
    expect(checkReceipt(receipt({ created_at: new Date(now - RECEIPT_MAX_AGE_MS - 1) }), expected, now).ok).toBe(false);
  });
});
