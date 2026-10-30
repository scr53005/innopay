/** Default: read-only reviewed repair plan. --apply appends missing allocations; never broadcasts.
 * npx tsx scripts/reconcile-027-receipt.ts [--apply]
 */
import dotenv from 'dotenv';
import { Client } from '@hiveio/dhive';
import { Prisma } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
import { planUnallocatedReceipt } from '../lib/debt-reconciliation';
dotenv.config({ path: '.env.local', quiet: true }); dotenv.config({ quiet: true });

const account = 'inno000-000-027';
const txId = 'beb78201194823a47b9b256c200c03993a37f9c3';
const ids = ['cms4xpokr0005jo04xkkb8qfh', 'cms4xqcgo0008jo04862bdi4k', 'cms4xs48d000bjo042sppmqbk'];
type Entry = { trx_id: string; block: number; timestamp: string; op: [string, Record<string, unknown>] };

async function main() {
  const { default: prisma } = await import('../lib/prisma');
  // Select only this repair's ledger fields. An implicit all-column read also
  // requests unrelated schema additions and obscures which migration is missing.
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name IN ('outstanding_debt', 'debt_payment')
  `);
  const required = {
    outstanding_debt: ['id', 'created_at', 'debtor', 'creditor', 'amount_hbd', 'original_amount', 'status', 'settlement_id'],
    debt_payment: ['debt_id', 'amount_hbd', 'tx_id', 'settlement_key'],
  };
  const missing = Object.entries(required).flatMap(([table, names]) => names
    .filter((name) => !columns.some((column) => column.table_name === table && column.column_name === name))
    .map((name) => `${table}.${name}`));
  if (missing.length) throw new Error(`Required ledger columns are missing: ${missing.join(', ')}. Check this environment's migrations before retrying; no changes made.`);
  const client = new Client(['https://api.hive.blog', 'https://api.syncad.com']);
  const head = await client.database.getAccountHistory(account, -1, 1);
  let cursor = head[0]?.[0];
  if (cursor == null) throw new Error('Account history unavailable');
  const history: Entry[] = [];
  for (let page = 0; page < 100; page++) {
    const rows = await client.database.getAccountHistory(account, cursor, Math.min(1000, cursor + 1));
    if (!rows.length) throw new Error('Incomplete account history');
    history.push(...rows.map(([, row]) => row as unknown as Entry));
    const oldest = Math.min(...rows.map(([index]) => index));
    if (oldest === 0) break;
    if (page === 99) throw new Error('Account history exceeded safe scan limit');
    cursor = oldest - 1;
  }
  const irreversible = Number((await client.database.getDynamicGlobalProperties()).last_irreversible_block_num);
  const request = history.find((entry) => entry.trx_id === txId && entry.op[0] === 'transfer_from_savings'
    && entry.op[1].from === account && entry.op[1].to === 'innopay' && entry.op[1].amount === '18.614 HBD');
  const fill = request && history.find((entry) => entry.op[0] === 'fill_transfer_from_savings' && entry.block <= irreversible
    && entry.op[1].from === account && entry.op[1].to === 'innopay' && entry.op[1].request_id === request.op[1].request_id
    && entry.op[1].amount === request.op[1].amount && entry.op[1].memo === request.op[1].memo);
  if (!request || !fill || request.block > irreversible) throw new Error('The exact irreversible 18.614 HBD receipt was not verified');
  const pending = await client.call('condenser_api', 'get_savings_withdraw_from', [account]) as Array<{ to: string; memo: string }>;
  if (pending.some((row) => row.to === 'innopay' && /^(netted:|customer-debt:)/.test(row.memo))) throw new Error('A new debt payment is in flight; reconcile it first');

  const result = await prisma.$transaction(async (db) => {
    const rows = await db.outstanding_debt.findMany({ where: { id: { in: ids } },
      select: { id: true, created_at: true, debtor: true, creditor: true, amount_hbd: true,
        original_amount: true, status: true, settlement_id: true,
        payments: { select: { amount_hbd: true, tx_id: true } } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }] });
    if (rows.length !== ids.length || rows.some((row) => row.debtor !== account || row.creditor !== 'innopay'
      || row.settlement_id || row.original_amount == null || !['unpaid', 'withdrawal_pending', 'paid'].includes(row.status))) {
      throw new Error('Debt group changed, is reserved, or lacks original amounts');
    }
    const otherAllocations = await db.debt_payment.findMany({ where: {
      tx_id: txId, debt_id: { notIn: ids }, debt: { OR: [{ debtor: account }, { creditor: account }] },
    }, select: { debt_id: true } });
    if (otherAllocations.length) throw new Error('This receipt also has allocations outside the reviewed debt group; review them before repair');
    const plan = planUnallocatedReceipt(rows.map((row) => ({ id: row.id, originalHbd: Number(row.original_amount),
      remainingHbd: Number(row.amount_hbd), payments: row.payments.map((payment) => ({ amountHbd: Number(payment.amount_hbd), txId: payment.tx_id })) })), txId, 18.614);
    if (!process.argv.includes('--apply')) return { dry_run: true, account, receipt_tx_id: txId, fill_at: fill.timestamp, ...plan };
    if (plan.additionalAllocationHbd !== 0 && plan.additionalAllocationHbd !== 6.204) throw new Error('The reviewed 6.204 HBD correction no longer matches current state');
    const appliedAt = new Date().toISOString();
    for (const item of plan.plans) {
      if (item.additionalPaymentHbd > 0) await db.debt_payment.create({ select: { id: true }, data: {
        debt_id: item.debtId, amount_hbd: item.additionalPaymentHbd, tx_id: txId,
        settlement_key: `audit:${txId}:${item.debtId}`, paid_at: new Date(fill.timestamp + 'Z'),
        notes: JSON.stringify({ type: 'unallocated_receipt_reconciliation', applied_at: appliedAt,
          receipt_hbd: 18.614, previously_allocated_hbd: plan.previouslyAllocatedHbd }),
      } });
      await db.outstanding_debt.update({ where: { id: item.debtId }, select: { id: true }, data: {
        amount_hbd: item.remainingHbd, status: item.remainingHbd === 0 ? 'paid' : 'unpaid',
        ...(item.remainingHbd === 0 ? { paid_at: new Date(fill.timestamp + 'Z'), payment_tx_id: txId } : {}),
      } });
    }
    return { dry_run: false, account, receipt_tx_id: txId, ...plan };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const path = `receipt-repair-027-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.warn(JSON.stringify(result, null, 2)); console.warn(`Saved ${path}. The Liman reconciliation hold is not cleared.`);
  await prisma.$disconnect();
}
main().catch((error) => { console.error('[RECEIPT-RECONCILIATION] Failed; inspect settlement keys before retrying if --apply was used:', error); process.exitCode = 1; });
