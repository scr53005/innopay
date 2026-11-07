import { describe, it, expect } from 'vitest';
import { getRecipientForEnvironment, maskSecret } from './hive';

// Regression guards: dev payments reached PROD restaurant accounts twice while dev detection
// relied on the database (2026-11-05 DATABASE_URL gone; 2026-11-07 dev hub on the PROD database).
// Now Stripe test mode decides: test money in → test account out.
describe('getRecipientForEnvironment', () => {
  const dev = { NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_test_x' };
  const prodDb = 'postgres://u:p@db.prisma.io:5432/postgres';
  it('Stripe test mode pays every restaurant\'s test account', () => {
    expect(getRecipientForEnvironment('indies.cafe', dev)).toBe('indies-test');
    expect(getRecipientForEnvironment('millewee', dev)).toBe('innodemo');
    expect(getRecipientForEnvironment('croque.bedaine', dev)).toBe('croque-test');
  });
  it('still redirects when the dev hub is connected to the PROD database (2026-11-07)', () => {
    expect(getRecipientForEnvironment('indies.cafe', { ...dev, POSTGRES_URL: prodDb })).toBe('indies-test');
  });
  it('a live Stripe key or a missing key pays the real account', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_live_x' })).toBe('indies.cafe');
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'development' })).toBe('indies.cafe');
  });
  it('never redirects a production build, even with a test key', () => {
    expect(getRecipientForEnvironment('indies.cafe', { NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_x' })).toBe('indies.cafe');
  });
  it('leaves customers and unknown accounts alone', () => {
    expect(getRecipientForEnvironment('inno000-000-002', dev)).toBe('inno000-000-002');
    expect(getRecipientForEnvironment('indies-test', dev)).toBe('indies-test');
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
