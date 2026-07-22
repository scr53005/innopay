import { describe, it, expect } from 'vitest';
import { validateHiveAccountName } from './hive-account-name';

describe('validateHiveAccountName', () => {
  it('accepts well-formed names', () => {
    for (const n of ['monterey-cart', 'mcc', 'abc.defg', 'a1b2c3', 'foo-bar-baz']) {
      expect(validateHiveAccountName(n).valid).toBe(true);
    }
  });

  it('rejects too short / too long', () => {
    expect(validateHiveAccountName('ab').valid).toBe(false);
    expect(validateHiveAccountName('a'.repeat(17)).valid).toBe(false);
  });

  it('rejects disallowed characters and uppercase-only-after-lowercasing edge', () => {
    expect(validateHiveAccountName('foo_bar').valid).toBe(false); // underscore
    expect(validateHiveAccountName('foo bar').valid).toBe(false); // space
    // input is lowercased first, so mixed case is normalized, not rejected
    expect(validateHiveAccountName('MonTerey').valid).toBe(true);
  });

  it('enforces per-segment rules (dots)', () => {
    expect(validateHiveAccountName('ab.cdef').valid).toBe(false); // segment < 3
    expect(validateHiveAccountName('foo..bar').valid).toBe(false); // consecutive dots
    expect(validateHiveAccountName('.foobar').valid).toBe(false); // leading dot
    expect(validateHiveAccountName('foobar.').valid).toBe(false); // trailing dot
    expect(validateHiveAccountName('1foo.bar').valid).toBe(false); // segment must start with a letter
  });

  it('enforces hyphen rules', () => {
    expect(validateHiveAccountName('-foobar').valid).toBe(false);
    expect(validateHiveAccountName('foobar-').valid).toBe(false);
    expect(validateHiveAccountName('foo--bar').valid).toBe(false);
  });

  it('returns a non-empty message on failure and empty on success', () => {
    expect(validateHiveAccountName('ab').message).not.toBe('');
    expect(validateHiveAccountName('monterey-cart').message).toBe('');
  });
});
