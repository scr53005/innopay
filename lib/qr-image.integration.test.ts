import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes, ZXING_WASM_SHA256 } from 'zxing-wasm/reader';
import { QR_IMAGE_OPTIONS } from './qr-image';
import { parseQrRequest } from './qr-request';

beforeAll(async () => {
  const wasm = await readFile(new URL('../public/qr/zxing_reader-3.1.6.wasm', import.meta.url));
  expect(createHash('sha256').update(wasm).digest('hex')).toBe(ZXING_WASM_SHA256);
  await prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(wasm).buffer }, fireImmediately: true });
}, 10000);

describe('real Indies printed QR regression', () => {
  it('decodes the rounded-corner sticker with the actual WASM engine and offers the HTTPS menu for its table', async () => {
    const image = await readFile(new URL('../tests/fixtures/qr/indies-sticker.jpg', import.meta.url));
    const result = (await readBarcodes(new Uint8Array(image), QR_IMAGE_OPTIONS)).find(value => value.isValid);
    expect(result?.text).toBe('http://indies.innopay.lu/menu?table=1');
    expect(parseQrRequest(result!.text)).toEqual({ kind: 'link', hostname: 'indies.innopay.lu', href: 'https://indies.innopay.lu/menu?table=1' });
  });
});
