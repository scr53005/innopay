/**
 * Create the ecosystem-wide vendor-number sequence `vendor_memo_id_seq`
 * (the memo `V:` token allocator). project_hatchery_vendor_hatching, unit 2.
 *
 * Idempotent + re-run safe: `CREATE SEQUENCE IF NOT EXISTS` never resets an
 * existing sequence, so re-running cannot rewind and re-hand-out numbers
 * already given to hatched vendors. The START is computed from innopay's
 * current max spoke.memo_vendor_id, floored at 6 (1–4 Tier C, 5 = MCC in
 * innohatch). Postgres nextval() then guarantees atomic, collision-free
 * allocation under concurrent hatches.
 *
 * A Postgres sequence is not a Prisma model, so this is a script (run once
 * on dev, once on prod) rather than a schema migration — same operational
 * pattern as register-innohatch-spoke.ts.
 *
 * Run (from innopay/):
 *   npx tsx scripts/create-vendor-sequence.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { computeSequenceStart } from '../lib/vendor-memo-id';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

async function main() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (!dbUrl) {
    throw new Error('POSTGRES_URL is not set — check innopay/.env (or .env.local).');
  }
  let dbLabel = 'UNKNOWN';
  try {
    const u = new URL(dbUrl);
    dbLabel = `${u.host}${u.pathname}`; // never the password
  } catch {
    /* label only */
  }
  console.log(`[create-vendor-sequence] Target DB: ${dbLabel}`);

  const prisma = new PrismaClient();
  try {
    const maxRows = await prisma.$queryRawUnsafe<{ max: number }[]>(
      `SELECT COALESCE(MAX(memo_vendor_id), 0)::int AS max FROM spoke`,
    );
    const innopayMax = maxRows[0]?.max ?? 0;
    const start = computeSequenceStart(innopayMax);
    console.log(
      `[create-vendor-sequence] innopay max spoke.memo_vendor_id = ${innopayMax} → sequence START = ${start} (1–4 Tier C, 5 = MCC)`,
    );

    // IF NOT EXISTS: creating is a one-time act; re-runs are no-ops and can
    // never rewind a sequence that has already handed out numbers.
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS vendor_memo_id_seq AS INTEGER START WITH ${start} MINVALUE 1`,
    );

    const stateRows = await prisma.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(
      `SELECT last_value, is_called FROM vendor_memo_id_seq`,
    );
    const { last_value, is_called } = stateRows[0];
    const nextWillBe = is_called ? Number(last_value) + 1 : Number(last_value);
    console.log(
      `[create-vendor-sequence] DONE. vendor_memo_id_seq exists; next allocation → ${nextWillBe}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[create-vendor-sequence] FAILED:', e);
  process.exit(1);
});
