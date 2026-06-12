/**
 * List each linked wallet account and the email of its Innopay user.
 * Equivalent to:
 *   SELECT w."accountName", i.email
 *   FROM walletuser w, innouser i
 *   WHERE w."userId" = i.id;
 *
 * Uses Prisma (no raw-SQL quoting / case-folding headaches) and prints the
 * masked DB host first so you can SEE which database answered — local DEV vs
 * Vercel PROD. By default it loads .env.local (DEV); pass --prod to use .env.
 *
 * Usage (PowerShell, from innopay/):
 *   npx tsx scripts/list-wallet-emails.ts          # DEV  (.env.local)
 *   npx tsx scripts/list-wallet-emails.ts --prod    # PROD (.env)
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const useProd = process.argv.includes('--prod');
// override: true is ESSENTIAL. dotenv refuses to overwrite any var already in
// process.env (override defaults to false). If .env was loaded first — by tsx,
// a transitive `import 'dotenv/config'`, or the shell — its POSTGRES_URL is
// already present, so a plain config({ path: '.env.local' }) is silently
// ignored and the script hits PROD. override:true forces the chosen file to win.
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
  console.log(`Env file:    ${useProd ? '.env (PROD)' : '.env.local (DEV)'}`);
  console.log(`DB host:     ${maskedHost(process.env.POSTGRES_URL)}`);
  console.log('');

  const rows = await prisma.walletuser.findMany({
    where: { userId: { not: null }, innouser: { isNot: null } },
    select: { accountName: true, innouser: { select: { email: true } } },
    orderBy: { accountName: 'asc' },
  });

  if (rows.length === 0) {
    console.log('No linked wallet/user rows found.');
    return;
  }

  console.log('accountName'.padEnd(20) + 'email');
  console.log('-'.repeat(20) + '-'.repeat(30));
  for (const r of rows) {
    console.log(r.accountName.padEnd(20) + (r.innouser?.email ?? ''));
  }
  console.log(`\n${rows.length} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
