/**
 * Backfill original_amount for existing outstanding_debt rows.
 * Sets original_amount = amount_hbd where original_amount IS NULL.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/backfill-original-amount.ts           # dry run (count only)
 *   npx tsx scripts/backfill-original-amount.ts --execute  # apply backfill
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');

  const nullCount = await prisma.outstanding_debt.count({
    where: { original_amount: null },
  });

  console.log(`Found ${nullCount} outstanding_debt rows with original_amount = NULL`);

  if (nullCount === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  if (!execute) {
    console.log('Dry run — pass --execute to apply backfill.');
    return;
  }

  // Backfill: set original_amount = amount_hbd for all rows where it's null
  const result = await prisma.$executeRaw`
    UPDATE outstanding_debt
    SET original_amount = amount_hbd
    WHERE original_amount IS NULL
  `;

  console.log(`Backfilled ${result} rows: original_amount = amount_hbd`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
