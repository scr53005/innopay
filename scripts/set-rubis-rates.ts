/**
 * Idempotent: sets each spoke's RUBIS "contract" (spoke.rubis_rate, spoke.rubis_tip_multiplier)
 * and prints the resulting table. Safe to re-run; only the spokes listed in RATES are touched.
 *
 * rubis_rate = RUBIS the hub sends the paying customer per fiat unit spent (null = off;
 * the balance is still displayed). Tips earn rate × rubis_tip_multiplier, tip capped at 50 %
 * of the subtotal (lib/rubis.ts). See RUBIS-PLAN.md.
 *
 * Target DB = POSTGRES_URL (.env.local then .env, .env wins). Run on DEV, then PROD:
 *   npx tsx scripts/set-rubis-rates.ts            # apply RATES
 *   npx tsx scripts/set-rubis-rates.ts --dry-run  # show what would change
 */
import { config } from 'dotenv';
import path from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

// The contract per spoke id (decided 2026-11-02/03). Zenbar / croque-bedaine: not distributing yet.
const RATES: Record<string, { rate: number | null; tipMultiplier: number }> = {
  indies: { rate: 0.1, tipMultiplier: 2 },
  millewee: { rate: 0.1, tipMultiplier: 2 },
  innohatch: { rate: 0.1, tipMultiplier: 2 }, // all Farm vendors
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.POSTGRES_URL ?? '';
  console.log(`Target DB: ${url.replace(/^.*@/, '').replace(/[/?].*$/, '')} · fingerprint ${createHash('sha256').update(url).digest('hex').slice(0, 8)}${dryRun ? '  (DRY RUN)' : ''}\n`);
  const prisma = new PrismaClient();
  try {
    for (const [id, c] of Object.entries(RATES)) {
      const spoke = await prisma.spoke.findUnique({ where: { id }, select: { id: true } });
      if (!spoke) { console.warn(`⚠ spoke '${id}' not found — skipped`); continue; }
      if (!dryRun) {
        await prisma.spoke.update({ where: { id }, data: { rubis_rate: c.rate, rubis_tip_multiplier: c.tipMultiplier } });
      }
    }
    const rows = await prisma.spoke.findMany({ orderBy: { id: 'asc' }, select: { id: true, rubis_rate: true, rubis_tip_multiplier: true } });
    console.log('spoke'.padEnd(18), 'rubis_rate'.padEnd(12), 'tip ×');
    for (const r of rows) {
      const want = RATES[r.id];
      const pending = dryRun && want ? `  → ${want.rate ?? 'off'} / ×${want.tipMultiplier}` : '';
      console.log(r.id.padEnd(18), String(r.rubis_rate ?? 'off').padEnd(12), String(r.rubis_tip_multiplier) + pending);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
