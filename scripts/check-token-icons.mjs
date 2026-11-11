// Show the Hive-Engine metadata (name, icon URL, description) of the Innopay tokens and check
// that each icon URL answers, with which content type. Wallets (Hive Keychain extension and app,
// Hive-Engine explorers) display the token logo from `metadata.icon`.
//
// Usage (from innopay/):  node scripts/check-token-icons.mjs [SYMBOL ...]
// Read-only: nothing is broadcast.

const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ['EURO', 'OCLT', 'LEI', 'RUBIS'];

async function token(symbol) {
  const response = await fetch('https://api.hive-engine.com/rpc/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'findOne', params: { contract: 'tokens', table: 'tokens', query: { symbol } } }),
  });
  return (await response.json()).result;
}

for (const symbol of symbols) {
  const t = await token(symbol);
  if (!t) { console.log(`\n${symbol}: not found`); continue; }
  let metadata = {};
  try { metadata = JSON.parse(t.metadata || '{}'); } catch { metadata = { unparsable: t.metadata }; }
  console.log(`\n${symbol} (${t.name}), issuer ${t.issuer}, precision ${t.precision}`);
  console.log('  metadata:', JSON.stringify(metadata));
  if (metadata.icon) {
    try {
      const r = await fetch(metadata.icon, { method: 'GET', redirect: 'follow' });
      const bytes = (await r.arrayBuffer()).byteLength;
      console.log(`  icon: HTTP ${r.status}, ${r.headers.get('content-type')}, ${bytes} bytes, final URL ${r.url}`);
      const proxied = `https://images.hive.blog/0x0/${metadata.icon}`;
      const p = await fetch(proxied);
      console.log(`  via images.hive.blog proxy: HTTP ${p.status}, ${p.headers.get('content-type')}`);
    } catch (error) {
      console.log('  icon fetch failed:', error.message);
    }
  } else {
    console.log('  no icon in metadata');
  }
}
