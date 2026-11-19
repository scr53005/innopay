import { describe, expect, it } from 'vitest';
import { isSendableEmail, normalizeEmail, planEmailNormalization } from './email-normalize';

describe('normalizeEmail', () => {
  it('lowercases and trims (the Apple Pay capitals case)', () => {
    expect(normalizeEmail('  Anthony.Mansour0@Gmail.com ')).toBe('anthony.mansour0@gmail.com');
  });
  it('returns null for nothing usable', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('isSendableEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isSendableEmail('user@example.com')).toBe(true);
  });
  it('refuses malformed addresses', () => {
    expect(isSendableEmail('user@example')).toBe(false);
    expect(isSendableEmail('user example@x.com')).toBe(false);
    expect(isSendableEmail('')).toBe(false);
  });
  it('refuses invisible and non-ASCII characters that Resend would reject', () => {
    expect(isSendableEmail('user​@example.com')).toBe(false); // zero-width space
    expect(isSendableEmail('josé@example.com')).toBe(false);
  });
});

describe('planEmailNormalization', () => {
  it('lowercases lone capitalized rows and leaves clean ones alone', () => {
    const plan = planEmailNormalization([
      { id: 1, email: 'Anthony.Mansour0@gmail.com' },
      { id: 2, email: 'clean@example.com' },
      { id: 3, email: ' Padded@Example.com ' },
    ]);
    expect(plan.fixes).toEqual([
      { id: 1, from: 'Anthony.Mansour0@gmail.com', to: 'anthony.mansour0@gmail.com' },
      { id: 3, from: ' Padded@Example.com ', to: 'padded@example.com' },
    ]);
    expect(plan.collisions).toEqual([]);
  });
  it('never auto-fixes two people whose addresses differ only by case', () => {
    const plan = planEmailNormalization([
      { id: 1, email: 'Dup@example.com' },
      { id: 2, email: 'dup@example.com' },
    ]);
    expect(plan.fixes).toEqual([]);
    expect(plan.collisions).toEqual([{ email: 'dup@example.com', rows: [{ id: 1, email: 'Dup@example.com' }, { id: 2, email: 'dup@example.com' }] }]);
  });
});
