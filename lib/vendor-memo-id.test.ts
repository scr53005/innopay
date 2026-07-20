import { describe, it, expect } from 'vitest';
import {
  computeSequenceStart,
  decideMemoVendorId,
  VENDOR_MEMO_ID_FLOOR,
} from './vendor-memo-id';

describe('computeSequenceStart', () => {
  it('starts at the reserved floor (6) when innopay only holds Tier C 1–4', () => {
    // max(spoke.memo_vendor_id) = 4 (indies..zenbar); MCC=5 lives in innohatch
    expect(computeSequenceStart(4)).toBe(6);
    expect(VENDOR_MEMO_ID_FLOOR).toBe(6);
  });

  it('never rewinds below the floor even on an empty/fresh DB', () => {
    expect(computeSequenceStart(0)).toBe(6);
  });

  it('defends against a Tier C spoke numbered at or above the floor', () => {
    expect(computeSequenceStart(6)).toBe(7);
    expect(computeSequenceStart(9)).toBe(10);
  });

  it('honors a custom floor', () => {
    expect(computeSequenceStart(4, 100)).toBe(100);
    expect(computeSequenceStart(120, 100)).toBe(121);
  });
});

describe('decideMemoVendorId (closing the Tier-C hand-pick collision gap)', () => {
  it('allocates for a brand-new spoke with no number given', () => {
    expect(
      decideMemoVendorId({ spokeExists: false, existing: null, descriptorHasKey: false }),
    ).toEqual({ action: 'allocate' });
  });

  it('keeps an existing number immutable (idempotent re-run)', () => {
    expect(
      decideMemoVendorId({ spokeExists: true, existing: 4, descriptorHasKey: false }),
    ).toEqual({ action: 'keep', value: 4 });
  });

  it('keeps the existing number and warns when a descriptor tries to change it', () => {
    const d = decideMemoVendorId({
      spokeExists: true,
      existing: 4,
      descriptorHasKey: true,
      descriptorValue: 9,
    });
    expect(d.action).toBe('keep');
    expect(d).toHaveProperty('value', 4);
    expect(d).toHaveProperty('warning');
  });

  it('treats explicit null as a container (umbrella spoke like innohatch)', () => {
    expect(
      decideMemoVendorId({ spokeExists: false, existing: null, descriptorHasKey: true, descriptorValue: null }),
    ).toEqual({ action: 'container', value: null });
  });

  it('keeps an existing container a container on a silent re-run', () => {
    expect(
      decideMemoVendorId({ spokeExists: true, existing: null, descriptorHasKey: false }),
    ).toEqual({ action: 'container', value: null });
  });

  it('allows a grandfathering override BELOW the floor without warning', () => {
    expect(
      decideMemoVendorId({ spokeExists: false, existing: null, descriptorHasKey: true, descriptorValue: 4 }),
    ).toEqual({ action: 'override', value: 4 });
  });

  it('warns on an override AT/ABOVE the floor (bypasses the sequence)', () => {
    const d = decideMemoVendorId({
      spokeExists: false,
      existing: null,
      descriptorHasKey: true,
      descriptorValue: 7,
    });
    expect(d.action).toBe('override');
    expect(d).toHaveProperty('value', 7);
    expect(d).toHaveProperty('warning');
    expect((d as { warning: string }).warning).toContain('BYPASSES');
  });
});
