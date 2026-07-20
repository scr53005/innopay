// Ecosystem-wide vendor number (the memo `V:` token) — atomic allocator +
// the single-source-of-truth allocation policy. project_hatchery_vendor_hatching.
//
// A single Postgres SEQUENCE (`vendor_memo_id_seq`) is THE global atomic
// counter. nextval() is concurrency-safe by construction: two salespeople
// hatching vendors at opposite ends of the city at the same moment get
// DISTINCT numbers, no application lock. Gaps (a rolled-back hatch burns a
// number) are harmless — `V:` needs uniqueness, not contiguity.
//
// Namespace partition:
//   1–4  Tier C spokes (indies..zenbar) → innopay `spoke.memo_vendor_id`
//   5    Monterey Coffee Cart (first Farm vendor, pre-sequence) → innohatch.vendor
//   6+   EVERY new vendor — Tier C OR Farm — from nextval('vendor_memo_id_seq')
// The sequence guarantees no number ever repeats, so it does NOT matter that
// Tier C numbers live on `spoke` and Farm numbers live in innohatch's `vendor`
// table. The ONE invariant: any number ≥ the floor comes from the sequence and
// nowhere else. Both enrollment paths (register-spoke.ts for Tier C, the /hatch
// flow for Farm) MUST draw from it — hand-picking a ≥ floor number is the one
// way to cause a silent cross-DB collision, which no @unique constraint catches.
//
// This module is PRISMA-FREE (pure logic + a DI'd allocator) so it is safe to
// import from Vitest AND from dotenv-loading scripts without tripping the
// import-hoisting env trap (global CLAUDE.md "Script dotenv hoisting").

/** The first number a fresh allocation may draw. 1–4 Tier C, 5 = MCC. */
export const VENDOR_MEMO_ID_FLOOR = 6;

/**
 * Pure: the sequence's START value given innopay's current max
 * `spoke.memo_vendor_id`. Never drops below the reserved floor, and never
 * below max+1 (defensive — if a Tier C spoke were ever numbered ≥ floor).
 */
export function computeSequenceStart(
  innopayMaxMemoId: number,
  floor: number = VENDOR_MEMO_ID_FLOOR,
): number {
  return Math.max(floor, innopayMaxMemoId + 1);
}

export type MemoIdDecision =
  | { action: 'keep'; value: number; warning?: string }
  | { action: 'container'; value: null }
  | { action: 'override'; value: number; warning?: string }
  | { action: 'allocate' };

/**
 * Pure: decide how a spoke enrollment resolves its `memo_vendor_id`, closing
 * the "new Tier C restaurant hand-picks a colliding number" gap.
 *
 *   keep      — spoke already has a number → immutable, never re-number
 *   container — descriptor explicitly `null` (umbrella spoke, e.g. innohatch)
 *   override  — descriptor gives a number on a new/unnumbered spoke
 *               (grandfathering only; warns if ≥ floor = bypasses the sequence)
 *   allocate  — brand-new spoke, no number given → draw nextval (caller does I/O)
 */
export function decideMemoVendorId(input: {
  spokeExists: boolean;
  existing: number | null;
  descriptorHasKey: boolean;
  descriptorValue?: number | null;
  floor?: number;
}): MemoIdDecision {
  const floor = input.floor ?? VENDOR_MEMO_ID_FLOOR;

  // 1. An assigned number is immutable — never re-number a spoke.
  if (input.spokeExists && typeof input.existing === 'number') {
    if (
      input.descriptorHasKey &&
      typeof input.descriptorValue === 'number' &&
      input.descriptorValue !== input.existing
    ) {
      return {
        action: 'keep',
        value: input.existing,
        warning: `descriptor memo_vendor_id ${input.descriptorValue} ignored — spoke already numbered ${input.existing} (vendor numbers are immutable)`,
      };
    }
    return { action: 'keep', value: input.existing };
  }

  // 2. Explicit null → container spoke (no vendor number of its own).
  if (input.descriptorHasKey && input.descriptorValue === null) {
    return { action: 'container', value: null };
  }

  // 3. Explicit number on a new/unnumbered spoke → grandfathering override.
  if (input.descriptorHasKey && typeof input.descriptorValue === 'number') {
    if (input.descriptorValue >= floor) {
      return {
        action: 'override',
        value: input.descriptorValue,
        warning: `hand-picked memo_vendor_id ${input.descriptorValue} is ≥ the sequence floor ${floor} — this BYPASSES vendor_memo_id_seq and risks colliding with a Farm hatch. Only override with grandfathering ids < ${floor}; otherwise omit the field and let it allocate.`,
      };
    }
    return { action: 'override', value: input.descriptorValue };
  }

  // 4. Existing unnumbered spoke, descriptor silent → stay a container
  //    (do NOT auto-number an umbrella spoke on a plain re-run).
  if (input.spokeExists) {
    return { action: 'container', value: null };
  }

  // 5. Brand-new spoke, no number anywhere → allocate atomically.
  return { action: 'allocate' };
}

/**
 * Atomically allocate the next vendor number via the injected query runner
 * (the caller supplies its own Prisma client → no prisma import here).
 * Requires the sequence to exist (scripts/create-vendor-sequence.ts).
 */
export async function allocateVendorMemoId(
  queryRaw: (sql: string) => Promise<Array<{ id: number }>>,
): Promise<number> {
  const rows = await queryRaw(`SELECT nextval('vendor_memo_id_seq')::int AS id`);
  return rows[0].id;
}
