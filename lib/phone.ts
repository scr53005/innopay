import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Normalize an optional, user-entered phone number to canonical E.164.
//
// Data-quality contract (Innopay vendor onboarding — vendors span LU/FR/BE/DE/IT/ES/…):
//  - Empty / missing input is allowed → { ok: true, e164: null } (phone is optional).
//  - The country code (a leading '+…') is REQUIRED. We deliberately pass NO default
//    region so nothing is guessed: a bare national number is ambiguous across our
//    multi-country vendor base (a Belgian '470…' must not be silently read as a
//    Luxembourg number), so it's rejected rather than misclassified.
//  - A valid number is stored ONLY in E.164 form (e.g. '+352621123456'), never the raw
//    input. Any country's number validates as long as it carries its '+' prefix.
//  - Anything not a valid number → { ok: false } so the caller can 400 it. We never
//    persist a raw/garbage string even though onboarding is attended.
export type PhoneNormalizeResult = { ok: true; e164: string | null } | { ok: false };

export function normalizePhone(input: unknown): PhoneNormalizeResult {
  if (typeof input !== 'string' || !input.trim()) return { ok: true, e164: null };
  const parsed = parsePhoneNumberFromString(input.trim()); // no default region → '+' required
  if (!parsed || !parsed.isValid()) return { ok: false };
  return { ok: true, e164: parsed.number };
}
