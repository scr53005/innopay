// Generate scan/review samples. This script never signs or submits a transfer.
const fs = require('node:fs/promises');
const path = require('node:path');
const QRCode = require('qrcode');
const encode = operation => `hive://sign/op/${Buffer.from(JSON.stringify(operation)).toString('base64url')}`;
async function main() {
  const destination = path.resolve(process.argv[2] || path.join(__dirname, '..', 'tmp', 'qr-scanner-fixtures'));
  await fs.mkdir(destination, { recursive: true });
  const samples = {
    'allowed-innopay': 'https://pay.innopay.lu/',
    'allowed-offchain': 'https://offchain.lu/',
    'blocked-lookalike': 'https://innopay.lu.example.com/',
  };
  for (const symbol of ['HIVE', 'HBD']) samples[`review-${symbol}`] = encode(['transfer', { from: '__signer', to: 'innopay', amount: `0.001 ${symbol}`, memo: 'QR review — vérifier avant de confirmer' }]);
  for (const symbol of ['EURO', 'LEI']) samples[`review-${symbol}`] = encode(['custom_json', { id: 'ssc-mainnet-hive', required_auths: ['__signer'], required_posting_auths: [], json: JSON.stringify({ contractName: 'tokens', contractAction: 'transfer', contractPayload: { symbol, to: 'innopay', quantity: '0.01', memo: 'QR review — verificare înainte de confirmare' } }) }]);
  for (const [name, payload] of Object.entries(samples)) await QRCode.toFile(path.join(destination, `${name}.png`), payload, { width: 1000, margin: 4, errorCorrectionLevel: 'M' });
  await fs.writeFile(path.join(destination, 'payloads.json'), JSON.stringify(samples, null, 2));
  console.log(`Created ${Object.keys(samples).length} scan/review samples in ${destination}. Transfer samples would send real funds if explicitly confirmed.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
