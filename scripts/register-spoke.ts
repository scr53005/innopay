/**
 * Generic, idempotent spoke registration from a JSON descriptor.
 * Part of the spoke scaffolding process (SPOKE-DOCUMENTATION.md →
 * "Scaffolding a New Next.js Spoke"). Supersedes the per-spoke
 * register-{name}-spoke.ts scripts for future spokes (the old ones are
 * kept as history / for their one-off extras like the V: backfill).
 *
 * Usage (from innopay/):
 *   npx tsx scripts/register-spoke.ts scripts/spokes/innohatch.json
 *   npx tsx scripts/register-spoke.ts --spokejson scripts/spokes/zenbar.json
 *
 * Descriptor shape: see scripts/spokes/*.json. `spoke` fields are
 * whitelisted (typos are reported, not silently dropped); `accounts` are
 * upserted on (spoke_id, hive_account, environment, role).
 *
 * Target DB = wherever POSTGRES_URL resolves (`.env.local` then `.env`,
 * .env wins — same as the Prisma CLI). The target host is printed before
 * writing; re-run against prod when deploying.
 */
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
// Prisma-free module (pure decision + DI'd allocator) — safe to import above
// the dotenv config() calls without triggering the lib/prisma singleton.
import { decideMemoVendorId, allocateVendorMemoId } from '../lib/vendor-memo-id';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

// Whitelisted spoke columns a descriptor may set (schema: prisma/schema.prisma → model spoke)
const SPOKE_FIELDS = [
  'name',
  'type',
  'domain_prod',
  'port_dev',
  'path',
  'attribute_name_1',
  'attribute_default_1',
  'attribute_storage_key_1',
  'attribute_name_2',
  'attribute_default_2',
  'attribute_storage_key_2',
  'attribute_name_3',
  'attribute_default_3',
  'attribute_storage_key_3',
  'image_1',
  'image_2',
  'image_3',
  'has_delivery',
  'fiat_currency',
  'iou_token',
  'memo_vendor_id',
  'service_model',
  'service_flags',
  'active',
  'ready',
] as const;

const REQUIRED_SPOKE_FIELDS = ['name', 'type', 'domain_prod', 'port_dev', 'path'] as const;
const REQUIRED_ACCOUNT_FIELDS = ['hive_account', 'environment', 'role'] as const;

interface AccountDescriptor {
  hive_account: string;
  environment: string; // 'prod' | 'dev' | 'demo'
  role: string; // e.g. 'orders_and_tips'
  primary?: boolean;
  settlement_enabled?: boolean;
  active?: boolean;
  notes?: string;
}

interface SpokeDescriptor {
  spoke: { id: string } & Record<string, unknown>;
  accounts: AccountDescriptor[];
}

function loadDescriptor(): SpokeDescriptor {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--spokejson');
  const jsonPath = flagIdx >= 0 ? args[flagIdx + 1] : args[0];
  if (!jsonPath) {
    throw new Error(
      'Usage: npx tsx scripts/register-spoke.ts <path-to-spoke.json>  (e.g. scripts/spokes/innohatch.json)',
    );
  }
  const resolved = path.resolve(process.cwd(), jsonPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Descriptor not found: ${resolved}`);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as SpokeDescriptor;

  if (!raw.spoke?.id) throw new Error('descriptor.spoke.id is required');
  for (const f of REQUIRED_SPOKE_FIELDS) {
    if (raw.spoke[f] === undefined) {
      throw new Error(`descriptor.spoke.${f} is required`);
    }
  }
  const unknown = Object.keys(raw.spoke).filter(
    (k) => k !== 'id' && !(SPOKE_FIELDS as readonly string[]).includes(k),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown spoke field(s): ${unknown.join(', ')} — typo, or add to SPOKE_FIELDS after a schema change`,
    );
  }
  if (!Array.isArray(raw.accounts) || raw.accounts.length === 0) {
    throw new Error('descriptor.accounts must be a non-empty array');
  }
  for (const a of raw.accounts) {
    for (const f of REQUIRED_ACCOUNT_FIELDS) {
      if (!a[f]) throw new Error(`account.${f} is required (${JSON.stringify(a)})`);
    }
  }
  return raw;
}

async function main() {
  const descriptor = loadDescriptor();
  const spokeId = descriptor.spoke.id;

  const dbUrl = process.env.POSTGRES_URL || '';
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
  console.log(`[register-spoke] '${spokeId}' → Target DB: ${dbLabel}`);

  const prisma = new PrismaClient();
  try {
    // Resolve the vendor number (memo `V:`) via the ONE authoritative path so
    // a new Tier C restaurant can't hand-pick a number that collides with MCC
    // (5, in innohatch) or the next Farm hatch. Existing numbers are immutable;
    // brand-new spokes allocate atomically from vendor_memo_id_seq; an explicit
    // number is a grandfathering override (warns if it bypasses the sequence);
    // explicit null = umbrella/container spoke. See lib/vendor-memo-id.ts.
    const { id: _id, memo_vendor_id: _descMemoId, ...fields } = descriptor.spoke;
    const existingSpoke = await prisma.spoke.findUnique({
      where: { id: spokeId },
      select: { memo_vendor_id: true },
    });
    const decision = decideMemoVendorId({
      spokeExists: existingSpoke !== null,
      existing: existingSpoke?.memo_vendor_id ?? null,
      descriptorHasKey: Object.prototype.hasOwnProperty.call(descriptor.spoke, 'memo_vendor_id'),
      descriptorValue: descriptor.spoke.memo_vendor_id as number | null | undefined,
    });

    let memoVendorId: number | null;
    if (decision.action === 'allocate') {
      try {
        memoVendorId = await allocateVendorMemoId((sql) => prisma.$queryRawUnsafe(sql));
      } catch (err) {
        throw new Error(
          `Could not allocate memo_vendor_id from vendor_memo_id_seq — run scripts/create-vendor-sequence.ts first. (${err instanceof Error ? err.message : String(err)})`,
        );
      }
      console.log(`[register-spoke] allocated memo_vendor_id ${memoVendorId} from vendor_memo_id_seq`);
    } else {
      memoVendorId = decision.value;
      if ('warning' in decision && decision.warning) {
        console.warn(`[register-spoke] ⚠ ${decision.warning}`);
      }
      console.log(`[register-spoke] memo_vendor_id: ${memoVendorId} (${decision.action})`);
    }

    const spokeData = { ...fields, memo_vendor_id: memoVendorId };
    const spoke = await prisma.spoke.upsert({
      where: { id: spokeId },
      update: spokeData as never,
      create: { id: spokeId, ...(spokeData as object) } as never,
    });
    console.log(
      `[register-spoke] spoke upserted: ${spoke.id} (${spoke.fiat_currency}/${spoke.iou_token}, ${spoke.service_model}, V:${spoke.memo_vendor_id ?? '—'}, active=${spoke.active}, ready=${spoke.ready})`,
    );

    for (const a of descriptor.accounts) {
      const acctFields = {
        active: a.active ?? true,
        settlement_enabled: a.settlement_enabled ?? false,
        primary: a.primary ?? false,
        notes: a.notes ?? null,
      };
      const acct = await prisma.spoke_account.upsert({
        where: {
          spoke_id_hive_account_environment_role: {
            spoke_id: spokeId,
            hive_account: a.hive_account,
            environment: a.environment,
            role: a.role,
          },
        },
        update: acctFields,
        create: {
          id: `spokeacct_${spokeId}_${a.environment}_${a.role}`.slice(0, 60),
          spoke_id: spokeId,
          hive_account: a.hive_account,
          environment: a.environment,
          role: a.role,
          ...acctFields,
        },
      });
      console.log(
        `[register-spoke] account upserted: ${acct.hive_account} (${acct.environment}/${acct.role}), primary=${acct.primary}, settlement_enabled=${acct.settlement_enabled}`,
      );
    }

    console.log(`[register-spoke] DONE for '${spokeId}'.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[register-spoke] FAILED:', e);
  process.exit(1);
});
