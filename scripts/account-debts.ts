/**
 * Read-only: every outstanding_debt row involving one account (as creditor or debtor), oldest
 * first. Pairs with scripts/account-ledger.ts: a missing HBD leg on chain should appear here.
 *
 * Usage (PowerShell):  npx tsx scripts/account-debts.ts test000-000-074
 * Uses the hub's .env database (check it points at the database you mean).
 */
import 'dotenv/config';

async function main() {
  const account = process.argv[2];
  if (!account) { console.error('Usage: npx tsx scripts/account-debts.ts <account>'); process.exit(1); }
  const { default: prisma } = await import('../lib/prisma');
  const rows = await prisma.outstanding_debt.findMany({
    where: { OR: [{ creditor: account }, { debtor: account }] },
    orderBy: { created_at: 'asc' },
  });
  if (rows.length === 0) console.log(`No outstanding_debt rows for ${account}.`);
  for (const r of rows as any[]) {
    console.log([
      r.created_at.toISOString().slice(0, 19),
      `${r.debtor ?? '?'} owes ${r.creditor}`,
      `HBD ${Number(r.amount_hbd).toFixed(3)}`,
      `EURO ${Number(r.amount_euro ?? 0).toFixed(2)}`,
      `reason=${r.reason}`,
      `status=${r.status}`,
      `| ${r.notes ?? ''}`,
    ].join('  '));
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
