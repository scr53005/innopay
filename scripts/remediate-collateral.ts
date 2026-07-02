/**
 * Remediate a collateralization discrepancy for ONE account — operator-reviewed, per-account.
 * Diagnose first with liman's `audit-account.ts <account>`, then apply the fix for its signature:
 *
 *   --revert-pending          Debts stuck `withdrawal_pending` from the old `to: debtor` no-op
 *                             settlement (fixed in liman commit 3c5583f — the alualu28 case). The
 *                             HBD is still in the account's savings, so this reverts the account's
 *                             withdrawal_pending debts (creditor=innopay) → 'unpaid', and liman's
 *                             now-correct cron re-settles them (this time actually to innopay).
 *
 *   --record-deficit=<hbd>    Missing Flow-7 deficit debt (the romainlux case): the deficit IOU was
 *                             clawed but no HBD debt was recorded (fixed forward this session). This
 *                             records a debtor=account, creditor=innopay HBD debt for <hbd> (= the
 *                             audit drift) so liman settles it from savings. --fiat=EUR by default.
 *
 * DRY RUN by default — prints what it WOULD do. Pass --apply to write. The target DB host is
 * printed before any write so you can confirm DEV vs PROD.
 *
 *   npx tsx scripts/remediate-collateral.ts alualu28 --revert-pending
 *   npx tsx scripts/remediate-collateral.ts alualu28 --revert-pending --apply
 *   npx tsx scripts/remediate-collateral.ts romainlux --record-deficit=3.67
 *   npx tsx scripts/remediate-collateral.ts romainlux --record-deficit=3.67 --fiat=EUR --apply
 */
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getCurrencyConfig, convertHbdToFiat } from '../lib/currency-config'; // pure — safe to static-import

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

const APPLY = process.argv.includes('--apply');
function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}
function dbLabel(): string {
  try {
    const u = new URL(process.env.POSTGRES_URL ?? '');
    return `${u.host}${u.pathname}`; // host + db only, never the password
  } catch {
    return 'UNKNOWN';
  }
}

async function main() {
  const account = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!account) {
    throw new Error('Usage: remediate-collateral.ts <account> (--revert-pending | --record-deficit=<hbd>) [--fiat=EUR] [--apply]');
  }
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL not set — check innopay/.env (or .env.local).');
  }

  const prisma = new PrismaClient();
  console.log(`[remediate] Target DB: ${dbLabel()} — account @${account} — mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  try {
    // ── Mode 1: revert stuck withdrawal_pending (the no-op settlement) ──
    if (process.argv.includes('--revert-pending')) {
      const where = { debtor: account, creditor: 'innopay', status: 'withdrawal_pending' } as const;
      const stuck = await prisma.outstanding_debt.findMany({ where, orderBy: { created_at: 'asc' } });
      if (stuck.length === 0) {
        console.log('[remediate] No withdrawal_pending debts (debtor=account, creditor=innopay). Nothing to revert.');
        return;
      }

      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      let recentWarn = false;
      console.log(`[remediate] ${stuck.length} withdrawal_pending debt(s) → would revert to 'unpaid':`);
      for (const d of stuck) {
        const recent = new Date(d.created_at) > fourDaysAgo;
        recentWarn = recentWarn || recent;
        console.log(
          `   - ${d.id}  ${new Date(d.created_at).toISOString().slice(0, 10)}  ${Number(d.amount_hbd).toFixed(3)} HBD  ${d.reason}` +
            (recent ? '  ⚠️ created <4d ago — could be a LIVE settlement; verify on-chain first' : ''),
        );
      }
      if (recentWarn) {
        console.log('[remediate] ⚠️  Some debts are recent — confirm on a block explorer that NO real transfer_from_savings is in flight before applying.');
      }

      if (!APPLY) {
        console.log("\n[remediate] DRY RUN — re-run with --apply to revert to 'unpaid'.");
        return;
      }
      const res = await prisma.outstanding_debt.updateMany({ where, data: { status: 'unpaid' } });
      console.log(`\n[remediate] ✅ Reverted ${res.count} debt(s) to 'unpaid'. Liman's next cron re-settles them (from ${account} → innopay).`);
      return;
    }

    // ── Mode 2: record a missing Flow-7 deficit debt ──
    const deficitStr = flag('record-deficit');
    if (deficitStr) {
      const hbd = parseFloat(deficitStr);
      if (!(hbd > 0)) throw new Error('--record-deficit must be a positive HBD amount (the audit drift)');

      const cfg = getCurrencyConfig((flag('fiat') ?? 'EUR').toUpperCase());
      // Dynamic import: services/currency touches prisma at module load — importing it before the
      // dotenv config() ran would build a client with an undefined connection string.
      const { getUsdPerFiatServerSide } = await import('../services/currency');
      const { conversion_rate: usdPerFiat } = await getUsdPerFiatServerSide(cfg.fiat);
      const fiatAmount = Math.round(convertHbdToFiat(hbd, usdPerFiat) * 100) / 100;

      console.log(`[remediate] Would record: @${account} owes innopay ${hbd.toFixed(3)} HBD (~${fiatAmount.toFixed(2)} ${cfg.fiat} / ${cfg.iouToken}), reason 'flow7_deficit_backfill'.`);
      if (!APPLY) {
        console.log('\n[remediate] DRY RUN — re-run with --apply to record the debt.');
        return;
      }
      const debt = await prisma.outstanding_debt.create({
        data: {
          debtor: account,
          creditor: 'innopay',
          amount_hbd: hbd,
          original_amount: hbd,
          amount_euro: fiatAmount,
          fiat_currency: cfg.fiat,
          token_symbol: cfg.iouToken,
          eur_usd_rate: usdPerFiat,
          reason: 'flow7_deficit_backfill',
          notes: `Backfill: Flow 7 deficit clawed the ${cfg.iouToken} IOU but recorded no HBD debt (bug fixed forward 2026-07). Recorded ${new Date().toISOString()}.`,
        },
      });
      console.log(`\n[remediate] ✅ Recorded debt ${debt.id}. Liman's next cron settles it via transfer_from_savings (${account} → innopay).`);
      return;
    }

    throw new Error('Specify a mode: --revert-pending OR --record-deficit=<hbd>');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[remediate] FAILED:', e);
  process.exit(1);
});
