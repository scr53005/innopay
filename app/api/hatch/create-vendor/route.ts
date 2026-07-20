// POST /api/hatch/create-vendor — the hatch orchestration (unit 3d).
// Behind the operator gate (middleware.ts). Ties together, in order:
//   1. Create the Hive vendor account (@innopay-custodied, same machinery as
//      customer wallets) — or resume if it already exists AND is ours.
//   2. Allocate the ecosystem-wide V: number (atomic sequence).
//   3. Upsert the spoke_account row under the innohatch umbrella (+ IBAN).
//   4. Register the account on merchant-hub (PUSH → watched from next poll).
//   5. Provision the vendor + catalogue on innohatch (from a category template).
// A Farm vendor needs no keys day-to-day (the till signs nothing; liman
// settles out via @innopay authority), so no credential handoff — the
// operator just hands the owner the till URL.
//
// Failure handling: steps 3–5 are idempotent/reversible; the response reports
// per-step status so a partial failure is diagnosable and the same form can be
// re-submitted (step 1 resumes on an account that is already ours).

import { NextResponse } from 'next/server';
import { accountExists, getSeed, generateHiveKeys, createAndBroadcastHiveAccount } from '@/services/hive';
import { createWalletUser, findWalletUserByAccountName } from '@/services/database';
import prisma from '@/lib/prisma';
import { allocateVendorMemoId } from '@/lib/vendor-memo-id';
import { sendHatchNotification } from '@/lib/hatch-notify';

const UMBRELLA_SPOKE_ID = 'innohatch';

function merchantHubUrl() {
  return (process.env.MERCHANT_HUB_URL || 'https://merchant-hub.innopay.lu').replace(/\/$/, '');
}
function innohatchUrl() {
  return (process.env.INNOHATCH_URL || 'https://innohatch.vercel.app').replace(/\/$/, '');
}
// Ecosystem env the vendor is created in (which streams/accounts). A real
// hatch is 'prod'; set HATCH_TARGET_ENV=dev for local end-to-end testing.
function targetEnv(): 'prod' | 'dev' {
  return process.env.HATCH_TARGET_ENV === 'dev' ? 'dev' : 'prod';
}

export async function POST(request: Request) {
  let body: {
    display_name?: unknown;
    hive_account?: unknown;
    template_key?: unknown;
    iban?: unknown;
    mock?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const display_name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const hive_account = typeof body.hive_account === 'string' ? body.hive_account.trim().toLowerCase() : '';
  const template_key = typeof body.template_key === 'string' ? body.template_key : undefined;
  const iban = typeof body.iban === 'string' && body.iban.trim() ? body.iban.trim().replace(/\s+/g, '') : null;
  const mock = body.mock === true; // dev-only: skip the real chain broadcast

  if (!display_name) return NextResponse.json({ error: 'display_name is required' }, { status: 400 });
  if (!/^[a-z][a-z0-9.-]{2,15}$/.test(hive_account)) {
    return NextResponse.json({ error: 'hive_account must be a valid Hive account name (3–16 chars)' }, { status: 400 });
  }

  const env = targetEnv();
  const steps: Record<string, string> = {};

  try {
    // ── 1. Account: create, resume-if-ours, or reject-if-someone-else's ──
    const exists = await accountExists(hive_account);
    if (exists) {
      const ours = await findWalletUserByAccountName(hive_account);
      if (!ours) {
        return NextResponse.json(
          { error: `Hive account '${hive_account}' already exists and is not an Innopay account — choose another name.` },
          { status: 409 },
        );
      }
      steps.account = 'existing (resumed)';
    } else {
      // Account not on chain. A walletuser row may still exist from a prior
      // MOCK attempt (mock never broadcasts, so accountExists stays false) —
      // don't double-create it; just resume the wiring.
      const leftover = await findWalletUserByAccountName(hive_account);
      if (leftover) {
        steps.account = 'existing walletuser (resumed, likely mock)';
      } else {
        const seed = getSeed(hive_account);
        const keychain = generateHiveKeys(hive_account, seed);
        const txId = await createAndBroadcastHiveAccount(hive_account, keychain, { mockBroadcast: mock });
        await createWalletUser(hive_account, txId, seed, keychain.masterPassword);
        steps.account = mock ? 'created (mock)' : 'created';
      }
    }

    // ── 2. Allocate the V: number (atomic; gaps harmless) ──
    const memoVendorId = await allocateVendorMemoId((sql) => prisma.$queryRawUnsafe(sql));
    steps.memo_vendor_id = String(memoVendorId);

    // ── 3. spoke_account under the innohatch umbrella (+ IBAN) ──
    await prisma.spoke_account.upsert({
      where: {
        spoke_id_hive_account_environment_role: {
          spoke_id: UMBRELLA_SPOKE_ID,
          hive_account,
          environment: env,
          role: 'orders_and_tips',
        },
      },
      update: { active: true, iban, notes: `Farm vendor: ${display_name}` },
      create: {
        spoke_id: UMBRELLA_SPOKE_ID,
        hive_account,
        environment: env,
        role: 'orders_and_tips',
        active: true,
        settlement_enabled: false, // payout rail is EMI/legal-gated future work
        primary: false,
        iban,
        notes: `Farm vendor: ${display_name}`,
      },
    });
    steps.spoke_account = 'ok';

    // ── 4. Register on merchant-hub (PUSH) ──
    const mhToken = process.env.MERCHANT_HUB_ADMIN_TOKEN;
    if (!mhToken) throw new Error('MERCHANT_HUB_ADMIN_TOKEN not configured');
    const mhRes = await fetch(`${merchantHubUrl()}/api/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mhToken}` },
      body: JSON.stringify({ account: hive_account, restaurantId: UMBRELLA_SPOKE_ID, env }),
    });
    if (!mhRes.ok) throw new Error(`merchant-hub register failed (${mhRes.status}): ${await mhRes.text()}`);
    steps.merchant_hub = 'ok';

    // ── 5. Provision the vendor + catalogue on innohatch ──
    const provSecret = process.env.PROVISION_SECRET;
    if (!provSecret) throw new Error('PROVISION_SECRET not configured');
    const provRes = await fetch(`${innohatchUrl()}/api/provision-vendor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provSecret}` },
      body: JSON.stringify({
        handle: hive_account, // handle = Hive account name (clean vendor URLs)
        display_name,
        hive_account,
        memo_vendor_id: memoVendorId,
        currency: 'EUR',
        template_key,
      }),
    });
    if (!provRes.ok) throw new Error(`innohatch provision failed (${provRes.status}): ${await provRes.text()}`);
    const prov = await provRes.json();
    steps.provision = 'ok';

    // ── 6. Notify the operators (soft-fail: never fails the hatch) ──
    steps.email = await sendHatchNotification({
      displayName: display_name,
      account: hive_account,
      memoVendorId: memoVendorId,
      env,
      tillUrl: prov.till_url,
      payUrl: prov.pay_url,
      iban,
    });

    return NextResponse.json({
      success: true,
      account: hive_account,
      display_name,
      memo_vendor_id: memoVendorId,
      env,
      till_url: prov.till_url,
      pay_url: prov.pay_url,
      steps,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[HATCH] create-vendor failed:', message, 'steps so far:', steps);
    return NextResponse.json({ error: message, steps }, { status: 500 });
  }
}
