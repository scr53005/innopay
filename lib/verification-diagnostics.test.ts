import { describe, expect, it } from 'vitest';
import { verificationContext, verificationSnapshot } from './verification-diagnostics';

const now = new Date('2026-10-23T10:01:00Z');
const fresh = {
  id: 'verification-test', created_at: new Date('2026-10-23T10:00:00Z'),
  expires_at: new Date('2026-10-23T10:10:00Z'), verified: false,
  verified_at: null, attempts: 0,
};

describe('verification diagnostics', () => {
  it('identifies a one-minute-old code as pending with nine minutes remaining', () => {
    expect(verificationSnapshot(fresh, now)).toMatchObject({ reason: 'pending', ageSeconds: 60, expiresInSeconds: 540 });
  });
  it('distinguishes no record from expiry', () => {
    expect(verificationSnapshot(null, now)).toEqual({ reason: 'missing' });
    expect(verificationSnapshot({ ...fresh, expires_at: now }, now).reason).toBe('expired');
  });
  it('distinguishes successful consumption from expiry and attempts exhaustion', () => {
    expect(verificationSnapshot({ ...fresh, verified: true, verified_at: now }, now).reason).toBe('already_used');
    expect(verificationSnapshot({ ...fresh, attempts: 3, expires_at: now }, now).reason).toBe('attempt_limit');
  });
  it('never spreads code, email or credential fields from a database record', () => {
    const record = { ...fresh, code: '123456', email: 'private@example.com', masterPassword: 'secret-master' };
    const snapshot = JSON.stringify(verificationSnapshot(record, now));
    for (const secret of [record.code, record.email, record.masterPassword]) expect(snapshot).not.toContain(secret);
  });
  it('correlates normalized email and database while excluding credentials and raw email', () => {
    const env = { POSTGRES_URL: 'postgres://secret-user:secret-password@db.example/private-db?sslmode=require' };
    const a = verificationContext(' USER@example.com ', 'https://wallet.innopay.lu/api/verify/request-code', null, env);
    const b = verificationContext('user@example.com', 'https://wallet.innopay.lu/api/verify/check-code', null,
      { POSTGRES_URL: 'postgres://other-user:rotated-password@db.example:5432/private-db?sslmode=verify-full' });
    expect(a.emailTag).toBe(b.emailTag);
    expect(a.databaseTag).toBe(b.databaseTag);
    const output = JSON.stringify(a);
    for (const secret of ['secret-user', 'secret-password', 'db.example', 'private-db', 'user@example.com']) expect(output).not.toContain(secret);
  });
  it('makes a different database distinguishable', () => {
    const tag = (db: string) => verificationContext('user@example.com', 'https://wallet.innopay.lu', null,
      { POSTGRES_URL: `postgres://user:password@db.example/${db}` }).databaseTag;
    expect(tag('one')).not.toBe(tag('two'));
  });
  it('handles missing or malformed database settings without exposing them', () => {
    expect(verificationContext('x@example.com', 'https://wallet.innopay.lu', null, {}).databaseTag).toBe('unconfigured');
    expect(verificationContext('x@example.com', 'https://wallet.innopay.lu', null, { POSTGRES_URL: 'secret-invalid-value' }).databaseTag).toBe('invalid-url');
  });
});
