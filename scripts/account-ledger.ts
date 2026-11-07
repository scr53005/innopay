/**
 * Read-only ledger of one Hive account: every HBD transfer (Hive) and every EURO token transfer
 * (Hive-Engine), oldest first, with running totals. Used to check that a customer's EURO tokens
 * are matched by the HBD innopay sent alongside them.
 *
 * Usage (PowerShell):  npx tsx scripts/account-ledger.ts test000-000-074
 * Public APIs only, no keys, no database.
 */

const HIVE_API = 'https://api.hive.blog';
const HE_HISTORY = 'https://history.hive-engine.com/accountHistory';

type Row = { time: string; chain: 'HBD' | 'EURO'; from: string; to: string; amount: number; memo: string };

async function hiveHistory(account: string): Promise<Row[]> {
  const rows: Row[] = [];
  let start = -1;
  for (let page = 0; page < 20; page++) {
    const limit = start === -1 ? 1000 : Math.min(1000, start);
    if (limit <= 0) break;
    const res = await fetch(HIVE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_account_history', params: [account, start, limit] }),
    });
    const data = await res.json();
    if (data.error) {
      // Thin history: the node asserts start >= limit - 1 (CLAUDE.md Hive RPC gotchas).
      if (start === -1 && String(data.error.message).includes('start >= args.limit-1')) { start = 0; continue; }
      throw new Error(JSON.stringify(data.error));
    }
    const ops: [number, { timestamp: string; op: [string, any] }][] = data.result ?? [];
    for (const [, h] of ops) {
      const [type, op] = h.op;
      if (type === 'transfer' && String(op.amount).endsWith(' HBD') && (op.from === account || op.to === account)) {
        rows.push({ time: h.timestamp, chain: 'HBD', from: op.from, to: op.to, amount: parseFloat(op.amount), memo: op.memo });
      }
    }
    if (ops.length < limit || ops.length === 0) break;
    start = ops[0][0] - 1;
    if (start < 0) break;
  }
  return rows;
}

async function euroHistory(account: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const res = await fetch(`${HE_HISTORY}?account=${account}&symbol=EURO&limit=500&offset=${offset}`);
    const data: any[] = await res.json();
    for (const h of data) {
      if (!['tokens_transfer', 'tokens_issue'].includes(h.operation)) continue;
      rows.push({
        time: new Date(h.timestamp * 1000).toISOString().slice(0, 19),
        chain: 'EURO', from: h.from, to: h.to, amount: parseFloat(h.quantity), memo: h.memo ?? '',
      });
    }
    if (data.length < 500) break;
  }
  return rows;
}

async function main() {
  const account = process.argv[2];
  if (!account) { console.error('Usage: npx tsx scripts/account-ledger.ts <account>'); process.exit(1); }
  const rows = [...await hiveHistory(account), ...await euroHistory(account)]
    .sort((a, b) => a.time.localeCompare(b.time));
  let hbd = 0; let euro = 0;
  for (const r of rows) {
    const sign = r.to === account ? 1 : -1;
    if (r.chain === 'HBD') hbd += sign * r.amount; else euro += sign * r.amount;
    console.log(
      `${r.time}  ${r.chain.padEnd(4)} ${(sign > 0 ? '+' : '-') + r.amount.toFixed(3)}`.padEnd(40),
      `${sign > 0 ? 'from ' + r.from : 'to ' + r.to}`.padEnd(26),
      `HBD=${hbd.toFixed(3)} EURO=${euro.toFixed(2)}`.padEnd(28),
      r.memo.slice(0, 70),
    );
  }
  console.log(`\nTotals from history: HBD ${hbd.toFixed(3)}, EURO ${euro.toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
