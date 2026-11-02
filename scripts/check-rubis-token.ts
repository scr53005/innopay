/**
 * Read-only RUBIS health check — Hive-Engine + Hive + HAFSQL. Safe to re-run any time.
 *
 * Checks (✓ / ✗ / ⚠):
 *  1. Hive-Engine token definition: symbol is exactly 'RUBIS', precision 2, issuer @innopay;
 *     prints supply / circulating / max supply.
 *  2. Hive-Engine balances: @innopay's RUBIS (the distribution float), number of holders,
 *     top holders, and whether Σ(balance + stake + pending) matches the token supply.
 *  3. Hive: @innopay exists; prints its active authority (the key that will sign rewards).
 *  4. HAFSQL: RUBIS custom_json operations in the last N days (default 30), straight from
 *     the chain — independent of the Hive-Engine API's view.
 *
 * Usage (from innopay/):
 *   npx tsx scripts/check-rubis-token.ts            # last 30 days of HAF history
 *   npx tsx scripts/check-rubis-token.ts --days 3   # shorter (HAF is slow — fewer blocks = faster)
 *   npx tsx scripts/check-rubis-token.ts --no-haf   # skip HAFSQL
 *
 * Needs HAF_CONNECTION_STRING in .env for step 4. The HAF query uses hive.operations_view with
 * an id-range bound (id >> 32 = block_num), the grants-proof pattern from merchant-hub.
 */
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.local') });
config({ path: path.resolve(__dirname, '../.env'), override: true });

const SYMBOL = 'RUBIS';
const EXPECTED_PRECISION = 2;
const ISSUER = 'innopay';
const HE_CONTRACTS = ['https://api.hive-engine.com/rpc/contracts', 'https://engine.rishipanthee.com/contracts', 'https://herpc.dtools.dev/contracts'];
const HIVE_NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://hive-api.arcange.eu'];
const BLOCKS_PER_DAY = 28_800;

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { failures++; console.log(`  ✗ ${m}`); };
const warn = (m: string) => console.log(`  ⚠ ${m}`);

async function rpc(urls: string[], body: unknown): Promise<any> {
  let last: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(`${url} → ${JSON.stringify(data.error)}`);
      return data.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const heFind = (table: string, query: object, limit = 1000, offset = 0) =>
  rpc(HE_CONTRACTS, { jsonrpc: '2.0', id: 1, method: 'find', params: { contract: 'tokens', table, query, limit, offset } });

async function checkToken() {
  console.log(`\n1. Hive-Engine token definition (${SYMBOL})`);
  const [token] = (await heFind('tokens', { symbol: SYMBOL }, 1)) ?? [];
  if (!token) { bad(`no token with symbol '${SYMBOL}'`); return null; }
  token.symbol === SYMBOL ? ok(`symbol = '${token.symbol}'`) : bad(`symbol = '${token.symbol}'`);
  token.precision === EXPECTED_PRECISION ? ok(`precision = ${token.precision}`) : bad(`precision = ${token.precision}, expected ${EXPECTED_PRECISION}`);
  token.issuer === ISSUER ? ok(`issuer = @${token.issuer}`) : bad(`issuer = @${token.issuer}, expected @${ISSUER}`);
  console.log(`    name: ${token.name}  supply: ${token.supply}  circulating: ${token.circulatingSupply}  max: ${token.maxSupply}`);
  return token as { supply: string; circulatingSupply: string; precision: number };
}

async function checkBalances(token: { supply: string } | null) {
  console.log(`\n2. Hive-Engine balances`);
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = (await heFind('balances', { symbol: SYMBOL }, 1000, offset)) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const total = (r: any) => Number(r.balance) + Number(r.stake ?? 0) + Number(r.pendingUnstake ?? 0) + Number(r.delegationsOut ?? 0);
  const innopay = rows.find((r) => r.account === ISSUER);
  console.log(`    @innopay liquid RUBIS (distribution float): ${innopay?.balance ?? '0'}`);
  console.log(`    holders: ${rows.length}`);
  for (const r of [...rows].sort((a, b) => total(b) - total(a)).slice(0, 10)) {
    console.log(`      ${r.account.padEnd(18)} ${r.balance}${Number(r.stake ?? 0) ? `  (staked ${r.stake})` : ''}`);
  }
  if (token) {
    const sum = rows.reduce((s, r) => s + total(r), 0);
    Math.abs(sum - Number(token.supply)) < 0.01
      ? ok(`Σ balances ${sum.toFixed(2)} = supply ${token.supply}`)
      : warn(`Σ balances ${sum.toFixed(2)} ≠ supply ${token.supply} (burned tokens sit on @null, which is included if it holds any)`);
  }
}

async function checkHiveAccount() {
  console.log(`\n3. Hive account @${ISSUER}`);
  const [acct] = (await rpc(HIVE_NODES, { jsonrpc: '2.0', id: 1, method: 'condenser_api.get_accounts', params: [[ISSUER]] })) ?? [];
  if (!acct) { bad(`@${ISSUER} not found on Hive`); return; }
  ok(`@${ISSUER} exists (HBD ${acct.hbd_balance}, HIVE ${acct.balance})`);
  console.log(`    active keys: ${acct.active.key_auths.map((k: [string, number]) => k[0]).join(', ')} (threshold ${acct.active.weight_threshold})`);
}

async function checkHaf(days: number) {
  console.log(`\n4. HAFSQL — ${SYMBOL} operations in the last ${days} day(s)`);
  const conn = process.env.HAF_CONNECTION_STRING;
  if (!conn) { warn('HAF_CONNECTION_STRING not set — skipped'); return; }
  const { Client } = await import('pg');
  const client = new Client({ connectionString: conn, statement_timeout: 180_000 });
  await client.connect();
  try {
    const head = BigInt((await client.query('SELECT num FROM hafd.blocks ORDER BY num DESC LIMIT 1')).rows[0].num);
    const fromBlock = head - BigInt(days * BLOCKS_PER_DAY);
    const lowerId = fromBlock << BigInt(32); // id >> 32 = block_num → id-range bound hits the PK index
    const { rows } = await client.query(
      `SELECT o.block_num, o.body->'value'->'required_auths' AS auths, o.body->'value'->>'json' AS json
         FROM hive.operations_view o
        WHERE o.op_type_id = 18
          AND o.id > $1
          AND o.body->'value'->>'id' = 'ssc-mainnet-hive'
          AND o.body->'value'->>'json' LIKE '%"${SYMBOL}"%'
        ORDER BY o.id DESC`,
      [lowerId.toString()],
    );
    console.log(`    head block ${head}, scanned from ${fromBlock}: ${rows.length} op(s)`);
    for (const r of rows.slice(0, 50)) {
      let actions: any[] = [];
      try { const j = JSON.parse(r.json); actions = Array.isArray(j) ? j : [j]; } catch { /* unparsable */ }
      for (const a of actions.filter((x) => x?.contractPayload?.symbol === SYMBOL)) {
        const p = a.contractPayload;
        console.log(`      #${r.block_num} ${String(r.auths?.[0] ?? '?').padEnd(16)} ${a.contractName}.${a.contractAction} ${p.quantity ?? ''} → ${p.to ?? ''} ${p.memo ? `"${String(p.memo).slice(0, 60)}"` : ''}`);
      }
    }
    if (rows.length > 50) console.log(`      … ${rows.length - 50} more`);
    ok('HAFSQL reachable');
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 30;
  const token = await checkToken();
  await checkBalances(token);
  await checkHiveAccount();
  if (!args.includes('--no-haf')) {
    try { await checkHaf(days); } catch (e) { bad(`HAFSQL check failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
