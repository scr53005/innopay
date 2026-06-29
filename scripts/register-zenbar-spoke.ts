/**
 * Idempotent registration of the Zenbar spoke in the innopay database.
 *
 * Registers, via upsert (safe to re-run any number of times):
 *   - spoke 'zenbar'            → RON / LEI, domain zenbar.innopay.lu, dev port 3003
 *   - spoke_account 'zenbar'      (prod, primary)
 *   - spoke_account 'zenbar-test' (dev)
 *
 * Until this row exists, resolveSpokeCurrency() returns EUR (the safe default), so this
 * is the switch that turns RON/LEI on for Zenbar.
 *
 * Target DB = wherever POSTGRES_URL resolves to. We load `.env.local` then `.env`
 * (.env wins) to match the Prisma CLI's behavior — i.e. the SAME database your
 * `prisma migrate dev` targeted, so the fiat_currency/iou_token columns are present.
 * The target host is printed before writing so you can confirm DEV vs PROD.
 *
 * Run (from innopay/):
 *   npx tsx scripts/register-zenbar-spoke.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load env BEFORE constructing PrismaClient. Next.js does this automatically for routes,
// but a standalone tsx script does not. .env loaded last with override so it is
// authoritative (matches Prisma CLI / where the migrations were applied).
config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

// settlement_enabled is now TRUE: liman's authorized spoke IOU reimbursement became
// multi-currency (2026-06-28) — it reads each debt's token_symbol and reclaims LEI for RON
// spokes instead of the old hardcoded EURO transfer. PREREQUISITE: the LEI-aware liman code
// must be LIVE IN PROD before flipping this on (otherwise liman would try to settle LEI debts
// with EURO, which @zenbar does not hold). Re-run this script on dev + prod to apply.
const SETTLEMENT_ENABLED = true;

const SPOKE_NOTES =
  'Zenbar RON/LEI spoke. settlement_enabled true (liman is LEI-aware as of 2026-06-28).';

async function main() {
  const dbUrl = process.env.POSTGRES_URL || '';
  if (!dbUrl) {
    throw new Error('POSTGRES_URL is not set — check innopay/.env (or .env.local).');
  }
  let dbLabel = 'UNKNOWN';
  try {
    const u = new URL(dbUrl);
    dbLabel = `${u.host}${u.pathname}`; // host + db name only, never the password
  } catch {
    /* ignore parse errors — just a display label */
  }
  console.log(`[register-zenbar] Target DB: ${dbLabel}`);

  const prisma = new PrismaClient();
  try {
    const spokeFields = {
      name: 'Zen Bar',
      type: 'restaurant',
      domain_prod: 'zenbar.innopay.lu',
      port_dev: 3003,
      path: '/',
      attribute_name_1: 'table',
      attribute_default_1: '0',
      attribute_storage_key_1: 'zenbar_table',
      fiat_currency: 'RON',
      iou_token: 'LEI',
      has_delivery: false,
      active: true,
      ready: false, // not customer-ready until the drawer widget ships
    };

    const spoke = await prisma.spoke.upsert({
      where: { id: 'zenbar' },
      update: spokeFields,
      create: { id: 'zenbar', ...spokeFields },
    });
    console.log(
      `[register-zenbar] spoke upserted: ${spoke.id} (${spoke.fiat_currency}/${spoke.iou_token}, ready=${spoke.ready})`
    );

    const accounts = [
      { id: 'spokeacct_zenbar_prod_orders_and_tips', hive_account: 'zenbar', environment: 'prod', primary: true },
      { id: 'spokeacct_zenbar_dev_orders_and_tips', hive_account: 'zenbar-test', environment: 'dev', primary: false },
    ];

    for (const a of accounts) {
      const acctFields = {
        active: true,
        settlement_enabled: SETTLEMENT_ENABLED,
        primary: a.primary,
        notes: SPOKE_NOTES,
      };
      const acct = await prisma.spoke_account.upsert({
        where: {
          spoke_id_hive_account_environment_role: {
            spoke_id: 'zenbar',
            hive_account: a.hive_account,
            environment: a.environment,
            role: 'orders_and_tips',
          },
        },
        update: acctFields,
        create: {
          id: a.id,
          spoke_id: 'zenbar',
          hive_account: a.hive_account,
          environment: a.environment,
          role: 'orders_and_tips',
          ...acctFields,
        },
      });
      console.log(
        `[register-zenbar] spoke_account upserted: ${acct.hive_account} (${acct.environment}), primary=${acct.primary}, settlement_enabled=${acct.settlement_enabled}`
      );
    }

    // Sanity check: confirm the currency the resolver will see.
    const check = await prisma.spoke.findUnique({
      where: { id: 'zenbar' },
      select: { fiat_currency: true, iou_token: true, active: true, ready: true },
    });
    console.log(
      `[register-zenbar] DONE. resolveSpokeCurrency('zenbar') → ${check?.fiat_currency}/${check?.iou_token} (active=${check?.active}, ready=${check?.ready})`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[register-zenbar] FAILED:', e);
  process.exit(1);
});
