// Offline diagnostic: reads images locally, prints destination metadata, never navigates/signs.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
async function main() {
  const moduleRoot = process.argv[2];
  const images = process.argv.slice(3);
  if (!moduleRoot || !images.length) throw new Error('Usage: node scripts/inspect-qr-image.cjs <package-root> <image> [image...]');
  const decoderRequire = createRequire(path.resolve(moduleRoot, 'package.json'));
  const { prepareZXingModule, readBarcodes } = decoderRequire('zxing-wasm/reader');
  const wasm = await fs.readFile(decoderRequire.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(wasm).buffer } });
  for (const filename of images) {
    const image = await fs.readFile(filename);
    const started = performance.now();
    const results = await readBarcodes(new Uint8Array(image), { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 });
    const result = results.find(value => value.isValid && value.text);
    const report = { image: path.basename(filename), decoded: !!result, elapsedMs: Math.round(performance.now() - started) };
    if (result) {
      try {
        const url = new URL(result.text);
        Object.assign(report, { protocol: url.protocol, hostname: url.hostname, pathname: url.pathname, table: url.searchParams.get('table') });
      } catch { Object.assign(report, { content: 'Non-URL QR content (not printed)' }); }
    }
    console.log(JSON.stringify(report));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
