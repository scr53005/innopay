import { describe, it, expect } from 'vitest';
import { maskSecret } from './hive';

// Regression guard: secrets (seed, master password, private keys) must NEVER be
// logged in cleartext. maskSecret is the choke point every log line now uses —
// if this ever regresses to returning more than a 3-char prefix, funds are at risk.
describe('maskSecret', () => {
  it('keeps only the first 3 characters and redacts the rest', () => {
    expect(maskSecret('P5Kabc123456789')).toBe('P5K…');
    expect(maskSecret('brave-hollow-...-twelve-words')).toBe('bra…');
  });

  it('never leaks the full secret regardless of length', () => {
    const secret = '5JqxTdEXAMPLEfullprivatekeymaterialthatmustnotleak';
    const masked = maskSecret(secret);
    expect(masked.length).toBeLessThanOrEqual(4); // 3 chars + the ellipsis
    expect(masked.includes(secret.slice(3))).toBe(false);
    expect(masked).toBe(secret.slice(0, 3) + '…');
  });

  it('handles short secrets without throwing', () => {
    expect(maskSecret('ab')).toBe('ab…');
  });

  it('returns a safe placeholder for empty / missing values', () => {
    expect(maskSecret('')).toBe('(none)');
    expect(maskSecret(undefined)).toBe('(none)');
    expect(maskSecret(null)).toBe('(none)');
  });
});
