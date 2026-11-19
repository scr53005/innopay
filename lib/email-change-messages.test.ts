import { describe, expect, it } from 'vitest';
import { emailChangeErrorKey, emailChangeMessages } from './email-change-messages';

describe('emailChangeErrorKey', () => {
  it('maps every API error to a message', () => {
    expect(emailChangeErrorKey(409, 'email_taken')).toBe('emailTaken');
    expect(emailChangeErrorKey(429, 'cooldown')).toBe('cooldown');
    expect(emailChangeErrorKey(400, 'wrong_code')).toBe('wrongCode');
    expect(emailChangeErrorKey(409, 'proof_already_used')).toBe('proof');
    expect(emailChangeErrorKey(401, 'bad_signature')).toBe('proof');
  });
  it('falls back sensibly on unknown errors', () => {
    expect(emailChangeErrorKey(429, undefined)).toBe('tooMany');
    expect(emailChangeErrorKey(500, 'internal_error')).toBe('generic');
  });
  it('has the same keys and placeholders in every language', () => {
    const fr = emailChangeMessages.fr;
    for (const copy of Object.values(emailChangeMessages)) {
      expect(Object.keys(copy.errors).sort()).toEqual(Object.keys(fr.errors).sort());
      expect(copy.errors.cooldown).toContain('{s}');
      expect(copy.errors.wrongCode).toContain('{n}');
    }
  });
});
