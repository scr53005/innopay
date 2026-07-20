import { describe, it, expect } from 'vitest';
import { buildHatchEmail, maskIban } from './hatch-notify';

describe('maskIban', () => {
  it('shows only the tail, ignoring spaces', () => {
    expect(maskIban('LU28 0019 4006 4475 0000')).toBe('…0000');
  });
  it('handles no IBAN', () => {
    expect(maskIban(null)).toBe('(none provided)');
  });
});

describe('buildHatchEmail', () => {
  const base = {
    displayName: 'Monterey Coffee Cart',
    account: 'monterey-cart',
    memoVendorId: 6,
    env: 'prod' as const,
    tillUrl: 'https://innohatch.vercel.app/monterey-cart/till',
    payUrl: 'https://innohatch.vercel.app/monterey-cart',
    iban: 'LU28 0019 4006 4475 0000',
  };

  it('puts the business + account in the subject and never leaks the full IBAN', () => {
    const { subject, text, html } = buildHatchEmail(base);
    expect(subject).toContain('Monterey Coffee Cart');
    expect(subject).toContain('@monterey-cart');
    expect(text).not.toContain('0019 4006'); // full IBAN masked
    expect(html).toContain('…0000');
  });

  it('includes the till + pay URLs and the vendor number', () => {
    const { text } = buildHatchEmail(base);
    expect(text).toContain(base.tillUrl);
    expect(text).toContain(base.payUrl);
    expect(text).toContain('6 (memo V:)');
  });

  it('adds the dev cleanup reminder only for dev hatches', () => {
    expect(buildHatchEmail({ ...base, env: 'dev' }).text).toContain('vendor-watchlist.mjs remove');
    expect(buildHatchEmail(base).text).not.toContain('vendor-watchlist.mjs remove');
  });
});
