/**
 * Reconcile RUBIS rewards against Hive-Engine. Idempotent; dry run by default.
 *
 * Why (2026-11-05): RUBIS was created with precision 0, so Hive-Engine rejected every
 * fractional reward (e.g. 0.61) while Hive accepted the broadcast. The hub logged
 * "Successfully broadcasted" and recorded the reward as 'sent', but no RUBIS arrived.
 * lib/rubis-distribute.ts now checks the sidechain before saying 'sent'; this script repairs
 * the rows written before that.
 *
 * For every reward row that is not 'skipped':
 *   - its tx is looked up on Hive-Engine (heExecution): executed → 'sent', rejected → 'failed';
 *     not found → reported, left alone (try again later);
 *   - with --apply, the status is corrected in the DB;
 *   - with --apply --resend, rows confirmed 'failed' (rejected on chain, or never broadcast) get a
 *     NEW transfer, verified the same way. Refused while RUBIS precision is below 2.
 *
 * Usage (from innopay/; the DB is whatever POSTGRES_URL points to, dev or prod):
 *   npx tsx scripts/reconcile-rubis-rewards.ts                     # report only
 *   npx tsx scripts/reconcile-rubis-rewards.ts --apply             # fix statuses
 *   npx tsx scripts/reconcile-rubis-rewards.ts --apply --resend    # fix + re-pay lost rewards
 */
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

const HE_CONTRACTS = ['https://api.hive-engine.com/rpc/contracts', 'https://engine.rishipanthee.com/contracts', 'https://herpc.dtools.dev/contracts'];
const MIN_PRECISION = 2;

async function rubisPrecision(): Promise<number | null> {
  for (const url of HE_CONTRACTS) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'findOne', params: { contract: 'tokens', table: 'tokens', query: { symbol: 'RUBIS' } } }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.result) return Number(data.result.precision);
    } catch { /* next node */ }
  }
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const resend = process.argv.includes('--resend');
  if (resend && !apply) throw new Error('--resend needs --apply');

  // Dynamic imports: the Prisma client must be built AFTER dotenv ran (CLAUDE.md hoisting gotcha).
  const { default: prisma } = await import('../lib/prisma');
  const { fetchHeTransaction, heExecution } = await import('../lib/verify-customer-leg');

  const host = (() => { try { return new URL(process.env.POSTGRES_URL ?? '').host; } catch { return '(unknown)'; } })();
  console.log(`Database: ${host}   mode: ${apply ? (resend ? 'APPLY + RESEND' : 'APPLY') : 'dry run'}\n`);

  const rows = await prisma.rubis_reward.findMany({
    where: { status: { in: ['pending', 'sent', 'unverified', 'failed'] } },
    orderBy: { created_at: 'asc' },
  });

  const toResend: typeof rows = [];
  const counts = { executed: 0, rejected: 0, unknown: 0, noTx: 0 };
  for (const row of rows) {
    const label = `${row.created_at.toISOString().slice(0, 16)} ${row.rubis_amount} RUBIS → @${row.customer_account} (${row.spoke_id}) [${row.status}]`;
    if (!row.rubis_tx_id) {
      counts.noTx++;
      console.log(`  ✗ ${label} never broadcast${row.error ? `: ${row.error}` : ''}`);
      if (row.status === 'failed') toResend.push(row);
      continue;
    }
    const execution = heExecution(await fetchHeTransaction(row.rubis_tx_id, 2, 1500));
    if (execution.status === 'executed') {
      counts.executed++;
      if (row.status !== 'sent') {
        console.log(`  ✓ ${label} executed on chain → sent`);
        if (apply) await prisma.rubis_reward.update({ where: { id: row.id }, data: { status: 'sent', error: null } });
      }
    } else if (execution.status === 'rejected') {
      counts.rejected++;
      console.log(`  ✗ ${label} ${execution.reason}`);
      if (apply && row.status !== 'failed') {
        await prisma.rubis_reward.update({ where: { id: row.id }, data: { status: 'failed', error: execution.reason } });
      }
      toResend.push(row);
    } else {
      counts.unknown++;
      console.log(`  ? ${label} tx ${row.rubis_tx_id} not found on Hive-Engine (yet): left alone`);
    }
  }

  const lost = toResend.reduce((s, r) => s + Number(r.rubis_amount), 0);
  console.log(`\n${rows.length} rows: ${counts.executed} executed, ${counts.rejected} rejected, ${counts.noTx} never broadcast, ${counts.unknown} not found.`);
  console.log(`Lost rewards to re-pay: ${toResend.length} (${lost.toFixed(2)} RUBIS).`);

  if (!resend || toResend.length === 0) {
    if (toResend.length > 0) console.log('Run with --apply --resend to re-pay them.');
    await prisma.$disconnect();
    return;
  }

  const precision = await rubisPrecision();
  if (precision === null || precision < MIN_PRECISION) {
    console.error(`\nRefusing to resend: RUBIS precision is ${precision ?? 'unknown'}, needs ≥ ${MIN_PRECISION}.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const { transferEuroTokens } = await import('../services/hive');
  console.log(`\nRe-paying ${toResend.length} reward(s) (RUBIS precision ${precision})…`);
  for (const row of toResend) {
    const amount = Number(row.rubis_amount);
    try {
      const txId = await transferEuroTokens(row.customer_account, amount, `RUBIS · merci ! (régularisation) — ${row.spoke_id}`, 'RUBIS');
      const execution = heExecution(await fetchHeTransaction(txId));
      const status = execution.status === 'executed' ? 'sent' : execution.status === 'rejected' ? 'failed' : 'unverified';
      await prisma.rubis_reward.update({
        where: { id: row.id },
        data: { status, rubis_tx_id: txId, error: execution.status === 'rejected' ? execution.reason : null },
      });
      console.log(`  ${status === 'sent' ? '✓' : '✗'} ${amount} RUBIS → @${row.customer_account} tx ${txId} [${status}]`);
    } catch (e) {
      console.error(`  ✗ ${amount} RUBIS → @${row.customer_account}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
