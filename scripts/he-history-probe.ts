/**
 * Probe history.hive-engine.com/accountHistory for one account: does it answer WITHOUT a
 * `symbol` (one mixed stream, newest first, offset pagination), and which fields come back?
 * Written for /user/history (HUB-USER-FEATURES-PLAN §3). Read-only, public API, no keys.
 *
 * Usage (PowerShell):  npx tsx scripts/he-history-probe.ts inno000-000-025 [symbol]
 */

// Makes this file a module: with no import/export, tsc treats it as a global script and its
// top-level names collide with scripts/account-ledger.ts (HE_HISTORY, main).
export {};

const HE_HISTORY = 'https://history.hive-engine.com/accountHistory';

async function main() {
  const account = process.argv[2];
  const symbol = process.argv[3];
  if (!account) { console.error('Usage: npx tsx scripts/he-history-probe.ts <account> [symbol]'); process.exit(1); }
  for (const offset of [0, 20]) {
    const url = `${HE_HISTORY}?account=${account}&limit=20&offset=${offset}${symbol ? `&symbol=${symbol}` : ''}`;
    const res = await fetch(url);
    console.log(`\n${url} → ${res.status} (access-control-allow-origin: ${res.headers.get('access-control-allow-origin')})`);
    const body = await res.json();
    if (!Array.isArray(body)) { console.log(JSON.stringify(body).slice(0, 400)); continue; }
    for (const h of body) {
      console.log(JSON.stringify(h));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
