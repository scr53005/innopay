import { describe, it, expect } from 'vitest';
import { getRecipientForEnvironment, maskSecret } from './hive';

// Regression guard (2026-11-05): dev detection read DATABASE_URL, which no longer exists
// locally, so a Flow 7 order from dev indies paid the PROD account indies.cafe.
describe('getRecipientForEnvironment', () => {
  const localDb = 'postgresql://u:p@localhost:5432/innopaydb';
  it('sends indies.cafe payments to indies-test against the local innopaydb', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'development', POSTGRES_URL: localDb })).toBe('indies-test');
  });
  it('never redirects a production build, whatever the database name', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'production', POSTGRES_URL: localDb })).toBe('indies.cafe');
  });
  it('keeps the real account against any other database', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'development', POSTGRES_URL: 'postgres://x@db.example/verceldb' })).toBe('indies.cafe');
  });
  it('ignores the legacy DATABASE_URL', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'development', DATABASE_URL: localDb })).toBe('indies.cafe');
  });
  it('only rewrites indies.cafe, never other spokes', () => {
    expect(getRecipientForEnvironment('millewee', { NODE_ENV: 'development', POSTGRES_URL: localDb })).toBe('millewee');
  });
  it('RECIPIENT_OVERRIDE wins', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'production', RECIPIENT_OVERRIDE: 'indies-acc' })).toBe('indies-acc');
  });
});

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
