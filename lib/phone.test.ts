import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('treats empty / missing input as an allowed no-op (phone is optional)', () => {
    expect(normalizePhone('')).toEqual({ ok: true, e164: null });
    expect(normalizePhone('   ')).toEqual({ ok: true, e164: null });
    expect(normalizePhone(undefined)).toEqual({ ok: true, e164: null });
    expect(normalizePhone(null)).toEqual({ ok: true, e164: null });
  });

  it('accepts numbers from any country when the + prefix is present', () => {
    expect(normalizePhone('+352 621 123 456')).toEqual({ ok: true, e164: '+352621123456' }); // LU
    expect(normalizePhone('+33 6 12 34 56 78')).toEqual({ ok: true, e164: '+33612345678' }); // FR
    expect(normalizePhone('+32 470 12 34 56')).toEqual({ ok: true, e164: '+32470123456' }); // BE
    expect(normalizePhone('+49 151 12345678')).toEqual({ ok: true, e164: '+4915112345678' }); // DE
    expect(normalizePhone('+39 320 1234567')).toEqual({ ok: true, e164: '+393201234567' }); // IT
    expect(normalizePhone('+34 612 34 56 78')).toEqual({ ok: true, e164: '+34612345678' }); // ES
  });

  it('strips formatting and stores canonical E.164 only', () => {
    expect(normalizePhone('+352-621-123-456')).toEqual({ ok: true, e164: '+352621123456' });
  });

  it('rejects a bare national number (no country code) rather than guessing the country', () => {
    // Ambiguous across our multi-country vendor base — must be rejected, not read as LU.
    expect(normalizePhone('621 123 456')).toEqual({ ok: false });
    expect(normalizePhone('470 12 34 56')).toEqual({ ok: false });
  });

  it('rejects garbage and implausible numbers', () => {
    expect(normalizePhone('not a phone')).toEqual({ ok: false });
    expect(normalizePhone('+12')).toEqual({ ok: false });
  });
});
