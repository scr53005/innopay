/**
 * One-off cleanup: lowercase innouser.email rows written with capitals before 2026-11-19.
 *
 * Why: every recovery lookup lowercases its input and Postgres compares case-sensitively,
 * so a stored 'Anthony.Mansour0@gmail.com' can never be recovered by email. The Stripe
 * webhook used to store addresses verbatim (fixed: lib/email-normalize.ts).
 *
 * DRY RUN by default: prints what it would change. Two people whose addresses differ only
 * by case are listed as COLLISIONS and never touched: a human decides.
 * Idempotent: a second --apply finds nothing left to fix.
 *
 * Usage (PowerShell, from innopay/):
 *   npx tsx scripts/normalize-innouser-emails.ts                  # DEV  (.env.local), dry run
 *   npx tsx scripts/normalize-innouser-emails.ts --prod           # PROD (.env), dry run
 *   npx tsx scripts/normalize-innouser-emails.ts --prod --apply   # PROD, write
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { planEmailNormalization } from '../lib/email-normalize';

const useProd = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
// override: true so the chosen file wins over anything already loaded (see list-wallet-emails.ts).
config({ path: useProd ? '.env' : '.env.local', override: true });

function maskedHost(url: string | undefined): string {
  if (!url) return '(POSTGRES_URL not set)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
  } catch {
    return '(unparseable POSTGRES_URL)';
  }
}

const prisma = new PrismaClient();

async function main() {
  console.log(`DB: ${maskedHost(process.env.POSTGRES_URL)}  (${useProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'dry run'})\n`);

  const rows = await prisma.innouser.findMany({ select: { id: true, email: true }, orderBy: { id: 'asc' } });
  const plan = planEmailNormalization(rows);

  console.log(`${rows.length} innouser rows, ${plan.fixes.length} to lowercase, ${plan.collisions.length} collision(s).\n`);
  for (const fix of plan.fixes) console.log(`  fix  #${fix.id}: ${JSON.stringify(fix.from)} -> ${fix.to}`);
  for (const c of plan.collisions) {
    console.log(`  COLLISION ${c.email}: ${c.rows.map((r) => `#${r.id} ${JSON.stringify(r.email)}`).join(', ')}`);
  }

  if (!apply) {
    console.log('\nDry run: nothing written. Re-run with --apply to lowercase the "fix" rows.');
    return;
  }
  let done = 0;
  for (const fix of plan.fixes) {
    try {
      await prisma.innouser.update({ where: { id: fix.id }, data: { email: fix.to } });
      done++;
    } catch (error: any) {
      console.error(`  FAILED #${fix.id}: ${error?.code ?? ''} ${error?.message ?? error}`);
    }
  }
  console.log(`\nLowercased ${done}/${plan.fixes.length}. Collisions left for a human: ${plan.collisions.length}.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
