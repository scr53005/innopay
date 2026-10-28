// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TextDecoder, TextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletQrScanner, { WalletQrScanSession } from './WalletQrScanner';
import { QrImageError } from '../../lib/qr-image';
import type { WalletLanguage } from '../../lib/wallet-navigation';

const camera = vi.hoisted(() => ({ decode: null as null | ((result: { data: string }) => void), start: vi.fn(), destroy: vi.fn(), instances: 0, read: vi.fn() }));
vi.mock('../../lib/qr-image', async importOriginal => ({ ...(await importOriginal<typeof import('../../lib/qr-image')>()), readQrImage: camera.read }));
vi.mock('qr-scanner', () => ({ default: class {
  constructor(_video: unknown, callback: (result: { data: string }) => void) { camera.decode = callback; camera.instances++; }
  start = camera.start; destroy = camera.destroy;
  setInversionMode() {} hasFlash = async () => false;
  static listCameras = async () => [];
  static scanImage = camera.read;
} }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const navigate = vi.fn();
const dialogMethods = ['showModal', 'close'] as const;
const dialogDescriptors = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('TextDecoder', TextDecoder);
  vi.stubGlobal('fetch', vi.fn());
  localStorage.clear(); localStorage.setItem('innopay_accountName', 'alice'); localStorage.setItem('innopay_activePrivate', 'fixture-active-key');
  camera.instances = 0; camera.decode = null; camera.start.mockReset().mockResolvedValue(undefined); camera.destroy.mockReset(); camera.read.mockReset(); navigate.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  dialogMethods.forEach((name, index) => { const descriptor = dialogDescriptors[index]; if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); });
});
const render = (language: WalletLanguage = 'fr') => act(async () => { root.render(<WalletQrScanner language={language} accountName="alice" />); });
const click = (element: Element) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const open = async () => {
  function Session() {
    const [visible, setVisible] = useState(true);
    return visible ? <WalletQrScanSession language="fr" accountName="alice" onClose={() => setVisible(false)} onNavigate={navigate} /> : null;
  }
  await act(async () => { root.render(<Session />); });
};
const decode = (raw: string) => act(async () => { camera.decode!({ data: raw }); });
const transfer = `hive://sign/op/${Buffer.from(JSON.stringify(['transfer', { from: '__signer', to: 'merchant', amount: '1.250 HBD', memo: 'Lunch' }])).toString('base64url')}`;

describe('wallet QR scanner', () => {
  it.each([
    ['fr', 'Scanner un QR'], ['en', 'Scan QR code'], ['de', 'QR-Code scannen'], ['lb', 'QR-Code scannen'],
  ] as const)('labels the entry action in %s without initializing the camera', async (language, label) => {
    await render(language); expect(host.querySelector('.hub-scan-button')?.textContent).toBe(label);
    expect(host.querySelector('.hub-scan-button')?.getAttribute('href')).toBe('/scan');
    expect(host.querySelector('.hub-scan-button')?.getAttribute('target')).toBe('_blank');
    expect(camera.instances).toBe(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('stops the camera on close, restores scrolling and handles a late camera startup', async () => {
    let finish!: () => void;
    camera.start.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await open(); expect(camera.instances).toBe(1); expect(document.body.style.overflow).toBe('hidden');
    await click(host.querySelector('[aria-label="Fermer le scanner"]')!);
    await act(async () => { finish(); });
    expect(host.querySelector('dialog')).toBeNull(); expect(camera.destroy).toHaveBeenCalled(); expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('automatically follows an approved link once, without a confirmation or any wallet credential access', async () => {
    await open(); const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    await decode('https://pay.innopay.lu/?table=12');
    await decode('https://pay.innopay.lu/?table=12');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://pay.innopay.lu/?table=12');
    expect(host.querySelector('a.hub-qr-primary')).toBeNull();
    expect(host.textContent).not.toContain('Ouvrir ce site');
    expect(fetch).not.toHaveBeenCalled(); expect(storageRead).not.toHaveBeenCalled();
  });
  it('rejects a misleading destination with no open action', async () => {
    await open(); await decode('https://innopay.lu.evil.example/');
    expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.querySelector('a.hub-qr-primary')).toBeNull(); expect(fetch).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it('reviews a transfer before signing, disables close during submission and prevents repeated confirmation', async () => {
    let finish!: (response: unknown) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await open(); await decode(transfer);
    expect(host.textContent).toContain('1.250 HBD'); expect(host.textContent).toContain('merchant'); expect(host.textContent).toContain('Lunch'); expect(fetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    const confirm = host.querySelector('button.hub-qr-primary')!;
    await act(async () => { confirm.dispatchEvent(new MouseEvent('click', { bubbles: true })); confirm.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((host.querySelector('[aria-label="Fermer le scanner"]') as HTMLButtonElement).disabled).toBe(true);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ raw: transfer, accountName: 'alice', activePrivateKey: 'fixture-active-key' });
    await act(async () => { finish({ ok: true, json: async () => ({ status: 'submitted', txId: 'fixture-transaction' }) }); });
    expect(host.textContent).toContain('fixture-transaction'); expect(host.textContent).toContain('encore en attente');
    expect(host.querySelector('button.hub-qr-primary')).toBeNull();
  });
  it('does not send with a wallet that changed after review, or automatically retry an uncertain submission', async () => {
    await open(); await decode(transfer); localStorage.setItem('innopay_accountName', 'mallory');
    await click(host.querySelector('button.hub-qr-primary')!); expect(fetch).not.toHaveBeenCalled();
    localStorage.setItem('innopay_accountName', 'alice'); vi.mocked(fetch).mockRejectedValue(new Error('lost response'));
    await click(host.querySelector('button.hub-qr-primary')!);
    expect(host.textContent).toContain('Vérifiez l’activité de votre compte'); expect(fetch).toHaveBeenCalledTimes(1);
    expect(host.querySelector('button.hub-qr-primary')).toBeNull();
  });
  it('offers image scanning in an insecure context without starting a camera', async () => {
    vi.stubGlobal('isSecureContext', false); camera.read.mockResolvedValue('http://indies.innopay.lu/menu?table=16');
    await open(); expect(camera.instances).toBe(0); expect(host.textContent).toContain('nécessite HTTPS');
    const input = host.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'qr.png', { type: 'image/png' })] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://indies.innopay.lu/menu?table=16'); expect(fetch).not.toHaveBeenCalled();
  });
  it('distinguishes a decoder startup failure from an image without a readable QR', async () => {
    vi.stubGlobal('isSecureContext', false); camera.read.mockRejectedValue(new QrImageError('unavailable'));
    await open();
    const input = host.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'qr.png', { type: 'image/png' })] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).toContain('Le lecteur d’image n’a pas pu démarrer');
    expect(host.textContent).not.toContain('Aucun code QR lisible'); expect(fetch).not.toHaveBeenCalled();
  });
  it('ends a stalled image read and ignores a result that arrives after the timeout', async () => {
    vi.stubGlobal('isSecureContext', false);
    let finish!: (text: string) => void;
    camera.read.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    await open();
    vi.useFakeTimers();
    try {
      const input = host.querySelector('input[type="file"]')!;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'qr.png', { type: 'image/png' })] });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(host.textContent).toContain('Lecture de l’image');
      await act(async () => { await vi.advanceTimersByTimeAsync(28000); });
      expect(host.textContent).toContain('La lecture de l’image a pris trop de temps');
      expect(host.textContent).not.toContain('Lecture de l’image…');
      await act(async () => { finish('https://innopay.lu/'); });
      expect(navigate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('refreshes only this wallet after a submitted QR transfer in the scanner tab, with the blockchain delay', async () => {
    const refresh = vi.fn();
    await act(async () => { root.render(<WalletQrScanner language="fr" accountName="alice" onTransferSubmitted={refresh} />); });
    vi.useFakeTimers();
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'innopay_qr_transfer_submitted', newValue: JSON.stringify({ accountName: 'mallory', at: Date.now() }) }));
      await vi.advanceTimersByTimeAsync(15000); expect(refresh).not.toHaveBeenCalled();
      window.dispatchEvent(new StorageEvent('storage', { key: 'innopay_qr_transfer_submitted', newValue: JSON.stringify({ accountName: 'alice', at: Date.now() }) }));
      await vi.advanceTimersByTimeAsync(14999); expect(refresh).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
