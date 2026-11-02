/**
 * Read-only: prints the account sets /api/sign-and-broadcast now enforces
 * (lib/sign-request-policy.ts, security fix 2026-11-02).
 *
 *  - Allowed recipients = 'innopay' + every ACTIVE spoke_account.hive_account.
 *    A customer payment / call-waiter fee to any other account is refused (403).
 *  - Protected signers  = the same set: innopay's key is never used to sign AS them.
 *
 * Run BEFORE deploying the fix, on DEV and PROD, and check that every account a
 * spoke sends to (orders go to 'innopay'; call-waiter fees in croque/millewee/zenbar
 * go straight to the restaurant account, incl. DEV accounts like innodemo /
 * zenbar-test) is listed. Missing one → register it in spoke_account first.
 *
 * Also lists the expected accounts that are MISSING, from the list below.
 *
 * Optional innohatch cross-check: set INNOHATCH_POSTGRES_URL to the innohatch DB of the SAME
 * environment; the script then reads innohatch's `vendor` table and flags every active Farm
 * vendor whose hive_account is not allowed here. /hatch registers vendors in spoke_account
 * automatically; vendors created any other way (seed scripts, e.g. mcc) may not be — Flow 6
 * payments to them would then be refused.
 *
 * Run (from innopay/, PowerShell):
 *   npx tsx scripts/list-signing-allowlist.ts
 *   npx tsx scripts/list-signing-allowlist.ts --innohatch-env ../innohatch/.env   # reads POSTGRES_URL from that file
 *   $env:INNOHATCH_POSTGRES_URL = '<url>'; npx tsx scripts/list-signing-allowlist.ts  # or explicit
 *
 * All Prisma Postgres DBs share the host db.prisma.io, so the host cannot tell two cloud
 * DBs apart. Each DB is printed with a FINGERPRINT (first 8 hex of sha256 of the full URL —
 * reveals nothing): same fingerprint = same database.
 */
import { config, parse } from 'dotenv';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

// Accounts the spokes are known to pay directly (call-waiter) or that must stay protected.
const EXPECTED = ['indies.cafe', 'croque.bedaine', 'croque.demo', 'millewee', 'innodemo', 'zenbar', 'zenbar-test', 'hatch-test'];

function fingerprint(url: string | undefined): string {
  if (!url) return '(not set)';
  const host = url.replace(/^.*@/, '').replace(/[/?].*$/, '');
  return `${host} · fingerprint ${createHash('sha256').update(url).digest('hex').slice(0, 8)}`;
}

function innohatchUrlFromArgs(): string | undefined {
  const i = process.argv.indexOf('--innohatch-env');
  if (i < 0) return process.env.INNOHATCH_POSTGRES_URL;
  const file = path.resolve(process.cwd(), process.argv[i + 1] ?? '');
  const url = parse(readFileSync(file)).POSTGRES_URL;
  if (!url) throw new Error(`No POSTGRES_URL in ${file}`);
  return url;
}

async function main() {
  const innohatchUrl = innohatchUrlFromArgs();
  console.log(`Hub DB:       ${fingerprint(process.env.POSTGRES_URL)}`);
  console.log(`Innohatch DB: ${fingerprint(innohatchUrl)}\n`);
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.spoke_account.findMany({
      orderBy: [{ spoke_id: 'asc' }, { environment: 'asc' }],
      select: { spoke_id: true, hive_account: true, environment: true, role: true, active: true },
    });
    console.log('spoke_id'.padEnd(18), 'hive_account'.padEnd(18), 'env'.padEnd(8), 'role'.padEnd(18), 'active');
    for (const r of rows) {
      console.log(r.spoke_id.padEnd(18), r.hive_account.padEnd(18), r.environment.padEnd(8), r.role.padEnd(18), r.active ? 'yes' : 'NO (not allowed)');
    }
    const allowed = new Set(['innopay', ...rows.filter((r) => r.active).map((r) => r.hive_account)]);
    console.log(`\nAllowed recipients / protected signers (${allowed.size}): ${[...allowed].sort().join(', ')}`);
    const missing = EXPECTED.filter((a) => !allowed.has(a));
    console.log(missing.length ? `\n⚠ Expected but NOT allowed: ${missing.join(', ')}` : '\n✓ All expected accounts present.');

    if (!innohatchUrl) {
      console.log('\n(innohatch cross-check skipped — pass --innohatch-env ../innohatch/.env to compare Farm vendors)');
    } else {
      const { Client } = await import('pg');
      const hatch = new Client({ connectionString: innohatchUrl });
      await hatch.connect();
      try {
        const { rows: vendors } = await hatch.query<{ handle: string; hive_account: string; is_active: boolean }>(
          'SELECT handle, hive_account, is_active FROM vendor ORDER BY handle',
        );
        const active = vendors.filter((v) => v.is_active);
        const notAllowed = active.filter((v) => !allowed.has(v.hive_account));
        console.log(`\ninnohatch vendors: ${vendors.length} (${active.length} active)`);
        console.log(notAllowed.length
          ? `⚠ Active Farm vendors NOT allowed (payments to them would be refused):\n${notAllowed.map((v) => `    ${v.handle.padEnd(18)} @${v.hive_account}`).join('\n')}`
          : '✓ Every active Farm vendor is allowed.');
      } finally {
        await hatch.end();
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
