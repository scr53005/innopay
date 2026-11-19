// One canonical form for innouser.email.
//
// Every lookup lowercases its input (verify/request-code, verify/check-code, account/retrieve)
// and Postgres compares text case-sensitively, so an address STORED with capitals can never be
// found again. 2026-11-18: an Apple Pay address reached the hub through Stripe with capitals;
// the webhook stored it verbatim. Normalize at every write, not only at lookup.

/** Trimmed + lowercased, or null when there is nothing usable. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email ? email : null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Resend rejects any non-ASCII address with a 422 (a zero-width space pasted from a spreadsheet
// is NOT matched by \s, so the shape regex alone lets it through). Printable ASCII only.
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/** Can we send a code to this (already normalized) address? */
export function isSendableEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_SHAPE.test(email) && PRINTABLE_ASCII.test(email);
}

export interface EmailRow { id: number; email: string }
export interface EmailNormalizationPlan {
  /** Rows that can simply be lowercased: nobody else holds the lowercase form. */
  fixes: { id: number; from: string; to: string }[];
  /** Two or more people whose addresses differ only by case: a human decides (merge or not). */
  collisions: { email: string; rows: EmailRow[] }[];
}

/** Pure planner for scripts/normalize-innouser-emails.ts (one-off cleanup of pre-2026-11-19 rows). */
export function planEmailNormalization(rows: EmailRow[]): EmailNormalizationPlan {
  const groups = new Map<string, EmailRow[]>();
  for (const row of rows) {
    const key = normalizeEmail(row.email);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const plan: EmailNormalizationPlan = { fixes: [], collisions: [] };
  for (const [email, group] of groups) {
    if (group.length > 1) {
      plan.collisions.push({ email, rows: group });
    } else if (group[0].email !== email) {
      plan.fixes.push({ id: group[0].id, from: group[0].email, to: email });
    }
  }
  return plan;
}
