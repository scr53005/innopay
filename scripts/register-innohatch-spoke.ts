/**
 * Idempotent registration of the innohatch (Innopay Farm) spoke in the
 * innopay database + backfill of the memo `V:` vendor-id sequence and
 * service models for the existing Tier C spokes.
 *
 * Registers, via upsert (safe to re-run any number of times):
 *   - spoke 'innohatch'  → EUR/EURO, pay.innopay.lu, dev port 3004,
 *     service_model 'counter_f2f', path '/mcc' (PoC single vendor —
 *     the multi-tenant return-URL design lands with the registry phase)
 *   - spoke_account 'hatch-test' (dev, role orders_and_tips,
 *     settlement_enabled FALSE — no liman settlement for the PoC)
 *   - memo_vendor_id backfill: 1=indies, 2=croque-bedaine, 3=millewee,
 *     4=zenbar (skips + warns on any id not present in this DB).
 *     Farm vendors continue the sequence in innohatch's own vendor table
 *     (MCC = 5); this registry is the authoritative source of the ranges.
 *
 * PREREQUISITE: the schema migration adding memo_vendor_id /
 * service_model / service_flags must be applied first:
 *   npx prisma migrate dev --name spoke_memo_vendor_id_service_model
 *   npx prisma generate
 *
 * Target DB = wherever POSTGRES_URL resolves. `.env.local` then `.env`
 * (.env wins), matching the Prisma CLI. The target host is printed before
 * writing so you can confirm DEV vs PROD. Re-run on prod when deploying.
 *
 * Run (from innopay/):
 *   npx tsx scripts/register-innohatch-spoke.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

// Tier C memo_vendor_id assignments (SPOKE-DOCUMENTATION.md → MEMO GRAMMAR).
const TIER_C_VENDOR_IDS: Array<{ spokeId: string; memoVendorId: number }> = [
  { spokeId: 'indies', memoVendorId: 1 },
  { spokeId: 'croque-bedaine', memoVendorId: 2 },
  { spokeId: 'millewee', memoVendorId: 3 },
  { spokeId: 'zenbar', memoVendorId: 4 },
];

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
    /* display label only */
  }
  console.log(`[register-innohatch] Target DB: ${dbLabel}`);

  const prisma = new PrismaClient();
  try {
    // ── 1. The innohatch spoke (container for Farm vendors) ──
    const spokeFields = {
      name: 'Innopay Farm',
      type: 'street-food',
      domain_prod: 'pay.innopay.lu',
      port_dev: 3004,
      // PoC: single vendor → land returning customers on MCC's page.
      // Known limitation: hub-rebuilt Flow 4/5/7 return URLs are per-spoke,
      // not per-vendor; the proper multi-tenant answer comes with the
      // registry-driven phase (HATCHERY-PLAN.md §14 Phase 2).
      path: '/mcc',
      attribute_name_1: 'order',
      attribute_default_1: null as string | null,
      attribute_storage_key_1: 'innohatch_order',
      fiat_currency: 'EUR',
      iou_token: 'EURO',
      has_delivery: false,
      memo_vendor_id: null as number | null, // container, not a vendor
      service_model: 'counter_f2f',
      service_flags: ['counter_f2f'],
      active: true,
      ready: false, // not customer-ready until the PoC field test passes
    };

    const spoke = await prisma.spoke.upsert({
      where: { id: 'innohatch' },
      update: spokeFields,
      create: { id: 'innohatch', ...spokeFields },
    });
    console.log(
      `[register-innohatch] spoke upserted: ${spoke.id} (${spoke.service_model}, dev port ${spoke.port_dev}, ready=${spoke.ready})`,
    );

    // ── 2. The dev account (PoC). No prod account exists yet. ──
    const acctFields = {
      active: true,
      settlement_enabled: false, // PoC: manual settlement; liman stays out
      primary: false,
      notes:
        'innohatch PoC dev account (Monterey Coffee Cart test stand). One Hive account = one merchant-hub spoke.',
    };
    const acct = await prisma.spoke_account.upsert({
      where: {
        spoke_id_hive_account_environment_role: {
          spoke_id: 'innohatch',
          hive_account: 'hatch-test',
          environment: 'dev',
          role: 'orders_and_tips',
        },
      },
      update: acctFields,
      create: {
        id: 'spokeacct_innohatch_dev_orders_and_tips',
        spoke_id: 'innohatch',
        hive_account: 'hatch-test',
        environment: 'dev',
        role: 'orders_and_tips',
        ...acctFields,
      },
    });
    console.log(
      `[register-innohatch] spoke_account upserted: ${acct.hive_account} (${acct.environment}), settlement_enabled=${acct.settlement_enabled}`,
    );

    // ── 3. memo_vendor_id backfill for Tier C (+ service model default) ──
    for (const { spokeId, memoVendorId } of TIER_C_VENDOR_IDS) {
      const existing = await prisma.spoke.findUnique({ where: { id: spokeId } });
      if (!existing) {
        console.warn(
          `[register-innohatch] ⚠ spoke '${spokeId}' not found in this DB — memo_vendor_id ${memoVendorId} NOT assigned (check the id, or run against the right DB)`,
        );
        continue;
      }
      if (
        existing.memo_vendor_id !== null &&
        existing.memo_vendor_id !== memoVendorId
      ) {
        console.warn(
          `[register-innohatch] ⚠ spoke '${spokeId}' already has memo_vendor_id ${existing.memo_vendor_id} ≠ ${memoVendorId} — left untouched (resolve manually)`,
        );
        continue;
      }
      await prisma.spoke.update({
        where: { id: spokeId },
        data: {
          memo_vendor_id: memoVendorId,
          service_model: 'table_remote',
          service_flags: ['self_order'],
        },
      });
      console.log(
        `[register-innohatch] ${spokeId} → memo_vendor_id ${memoVendorId} (table_remote/self_order)`,
      );
    }

    // ── 4. Sanity report ──
    const numbered = await prisma.spoke.findMany({
      where: { memo_vendor_id: { not: null } },
      select: { id: true, memo_vendor_id: true, service_model: true },
      orderBy: { memo_vendor_id: 'asc' },
    });
    console.log(
      `[register-innohatch] DONE. V: sequence in this DB: ${numbered
        .map((s) => `${s.memo_vendor_id}=${s.id}`)
        .join(', ')} (Farm vendors continue from 5 in innohatch.vendor)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[register-innohatch] FAILED:', e);
  process.exit(1);
});
