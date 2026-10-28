import { beforeEach, describe, expect, it, vi } from 'vitest';
const decoders = vi.hoisted(() => ({ prepare: vi.fn(), read: vi.fn(), fallback: vi.fn() }));
vi.mock('zxing-wasm/reader', () => ({ prepareZXingModule: decoders.prepare, readBarcodes: decoders.read }));
vi.mock('qr-scanner', () => ({ default: { scanImage: decoders.fallback, NO_QR_CODE_FOUND: 'No QR code found' } }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  decoders.prepare.mockReset().mockResolvedValue({}); decoders.read.mockReset(); decoders.fallback.mockReset();
});
describe('local photo QR decoding', () => {
  it('uses the stronger reader on original image bytes, self-hosting its WASM and enabling rotation/downscaling', async () => {
    const { readQrImage, QR_IMAGE_WASM } = await import('./qr-image');
    decoders.read.mockResolvedValue([{ isValid: true, text: 'http://indies.innopay.lu/menu?table=16' }]);
    const image = new Blob(['photo bytes'], { type: 'image/jpeg' });
    expect(await readQrImage(image)).toBe('http://indies.innopay.lu/menu?table=16');
    const options = decoders.prepare.mock.calls[0][0];
    expect(options.overrides.locateFile('zxing_reader.wasm', 'https://unneeded.example/')).toBe(QR_IMAGE_WASM);
    expect(decoders.read).toHaveBeenCalledWith(new Uint8Array(await image.arrayBuffer()), expect.objectContaining({ formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true }));
    expect(decoders.fallback).not.toHaveBeenCalled();
  });
  it('keeps the previous reader available when the stronger reader finds no valid code', async () => {
    const { readQrImage } = await import('./qr-image');
    decoders.read.mockResolvedValue([{ isValid: false, text: 'invalid' }]); decoders.fallback.mockResolvedValue({ data: 'https://offchain.lu/' });
    expect(await readQrImage(new Blob(['photo']))).toBe('https://offchain.lu/');
  });
  it('reports an unreadable image only after an available decoder actually found no QR', async () => {
    const { readQrImage } = await import('./qr-image');
    decoders.read.mockResolvedValue([]); decoders.fallback.mockRejectedValue('No QR code found');
    await expect(readQrImage(new Blob(['photo']))).rejects.toMatchObject({ code: 'notFound' });
  });
  it('reports decoder infrastructure errors separately and permits a later initialization attempt', async () => {
    const { readQrImage } = await import('./qr-image');
    decoders.prepare.mockRejectedValueOnce(new Error('WASM load failed')); decoders.fallback.mockRejectedValue(new Error('Worker load failed'));
    await expect(readQrImage(new Blob(['photo']))).rejects.toMatchObject({ code: 'unavailable' });
    decoders.read.mockResolvedValue([{ isValid: true, text: 'https://innopay.lu/' }]);
    expect(await readQrImage(new Blob(['photo']))).toBe('https://innopay.lu/'); expect(decoders.prepare).toHaveBeenCalledTimes(2);
  });
  it('bounds a stalled initialization and reports it as unavailable rather than blaming the photo', async () => {
    vi.useFakeTimers();
    try {
      const { readQrImage } = await import('./qr-image');
      decoders.prepare.mockImplementation(() => new Promise(() => {}));
      decoders.fallback.mockRejectedValue('No QR code found');
      const completed = readQrImage(new Blob(['photo'])).catch(error => error);
      await vi.waitFor(() => expect(decoders.prepare).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(12000);
      expect(await completed).toMatchObject({ code: 'unavailable' });
    } finally { vi.useRealTimers(); }
  });
});
