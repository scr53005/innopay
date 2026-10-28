import type { ReaderOptions } from 'zxing-wasm/reader';

// Keep the decoder byte-for-byte paired with its self-hosted WASM asset.
export const QR_IMAGE_WASM = '/qr/zxing_reader-3.1.6.wasm';
export const QR_IMAGE_OPTIONS: ReaderOptions = {
  formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true,
  tryDownscale: true, maxNumberOfSymbols: 1,
};
export class QrImageError extends Error {
  constructor(public readonly code: 'notFound' | 'unavailable') { super(code); }
}
class QrImageTimeout extends Error {
  constructor(readonly stage: string) { super(stage); this.name = 'QrImageTimeout'; }
}
async function bounded<T>(work: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new QrImageTimeout(stage)), 12000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
function progress(stage: string) { console.info(`[QR IMAGE] ${stage}`); }
let imageReader: Promise<typeof import('zxing-wasm/reader')> | null = null;
async function getImageReader() {
  if (!imageReader) {
    progress('reader.import:start');
    imageReader = bounded(import('zxing-wasm/reader'), 'reader.import').then(async reader => {
      progress('reader.import:done');
      progress('reader.initialize:start');
      await bounded(reader.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? QR_IMAGE_WASM : prefix + path },
        fireImmediately: true,
      }), 'reader.initialize');
      progress('reader.initialize:done');
      return reader;
    }).catch(error => { imageReader = null; throw error; });
  }
  return imageReader;
}
function report(decoder: string, outcome: string, started: number) {
  // No filename, image pixels, decoded contents, credentials or user metadata in logs.
  console.info(`[QR IMAGE] ${decoder}:${outcome} ${Math.round(performance.now() - started)}ms`);
}

/** Decode locally. ZXing handles photographed/styled stickers; keep the old reader as fallback. */
export async function readQrImage(file: Blob): Promise<string> {
  let noCodeFound = false;
  let started = performance.now();
  try {
    progress('file.read:start');
    const bytes = new Uint8Array(await bounded(file.arrayBuffer(), 'file.read'));
    progress('file.read:done');
    const reader = await getImageReader();
    progress('image.decode:start');
    const results = await bounded(reader.readBarcodes(bytes, QR_IMAGE_OPTIONS), 'image.decode');
    progress('image.decode:done');
    const result = results.find(value => value.isValid && value.text);
    if (result) { report('zxing-wasm', 'decoded', started); return result.text; }
    noCodeFound = true;
    report('zxing-wasm', 'not-found', started);
  } catch (error) { report('zxing-wasm', error instanceof QrImageTimeout ? `timeout:${error.stage}` : 'unavailable', started); }
  started = performance.now();
  try {
    progress('fallback.import:start');
    const Qr = (await bounded(import('qr-scanner'), 'fallback.import')).default;
    progress('fallback.import:done');
    try {
      progress('fallback.decode:start');
      const result = await bounded(Qr.scanImage(file, { returnDetailedScanResult: true }), 'fallback.decode');
      report('qr-scanner', 'decoded', started); return result.data;
    } catch (error) {
      report('qr-scanner', 'not-decoded', started);
    }
  } catch { report('qr-scanner', 'unavailable', started); }
  throw new QrImageError(noCodeFound ? 'notFound' : 'unavailable');
}
