import { describe, expect, it } from 'vitest';
import { clampSince, orderReference, PAYER_LOOKBACK_MAX_MS } from './order-reference';
import { rubisOrderKey } from './rubis';

describe('orderReference', () => {
  it('reads the suffix of an order memo', () => {
    expect(orderReference('d:1;b:2 TABLE 7 kcs-inno-ab12-cd34')).toBe('kcs-inno-ab12-cd34');
    expect(orderReference('kcs-inno-ab12-cd34')).toBe('kcs-inno-ab12-cd34');
  });

  it('agrees with the RUBIS order key', () => {
    const memo = 'd:1 TABLE 4 gst-inno-zz99-yy88';
    expect(rubisOrderKey('indies.cafe', memo, 'x')).toBe(`order:indies.cafe:${orderReference(memo)}`);
  });

  it('none for waiter calls, empty or absurd memos', () => {
    expect(orderReference('Un serveur est appelé TABLE 7 -inno-')).toBeNull();
    expect(orderReference(null)).toBeNull();
    expect(orderReference('')).toBeNull();
    expect(orderReference(`x-inno-${'a'.repeat(50)}`)).toBeNull();
  });
});

describe('clampSince', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  it('keeps a recent date', () => {
    expect(clampSince('2026-11-14T11:00:00Z', now)?.toISOString()).toBe('2026-11-14T11:00:00.000Z');
  });
  it('never goes further back than the maximum', () => {
    expect(clampSince('2026-01-01T00:00:00Z', now)?.getTime()).toBe(now - PAYER_LOOKBACK_MAX_MS);
  });
  it('rejects missing or invalid dates', () => {
    expect(clampSince(null, now)).toBeNull();
    expect(clampSince('yesterday', now)).toBeNull();
  });
});
