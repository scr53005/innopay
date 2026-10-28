'use client';

import React, { useEffect, useRef, useState } from 'react';
import type QrScanner from 'qr-scanner';
import { parseQrRequest, QrRequestError, type QrRequest } from '../../lib/qr-request';
import { qrMessages } from '../../lib/qr-messages';
import { readQrImage, QrImageError } from '../../lib/qr-image';
import type { WalletLanguage } from '../../lib/wallet-navigation';

function QrIcon() {
  return <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5" strokeLinecap="round" />
    <path d="M7 7h3v3H7zm7 0h3v3h-3zM7 14h3v3H7zm7 0h3v3h-3zm3 3h2v2h-2z" />
  </svg>;
}

const qrTransferNotice = 'innopay_qr_transfer_submitted';

export default function WalletQrScanner({ language, accountName, onTransferSubmitted }: { language: WalletLanguage; accountName: string | null; onTransferSubmitted?: () => void }) {
  const refresh = useRef(onTransferSubmitted);
  refresh.current = onTransferSubmitted;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: StorageEvent) => {
      if (event.key !== qrTransferNotice || !event.newValue || !refresh.current) return;
      try {
        const notice = JSON.parse(event.newValue);
        if (notice.accountName !== accountName || typeof notice.at !== 'number' || Math.abs(Date.now() - notice.at) > 120000) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => refresh.current?.(), Math.max(0, notice.at + 15000 - Date.now()));
      } catch { /* Ignore malformed display-refresh notices. */ }
    };
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('storage', changed); if (timer !== undefined) clearTimeout(timer); };
  }, [accountName]);
  return <div className="hub-scanner-row">
    <a className="hub-scan-button" href="/scan" target="_blank" rel="noopener noreferrer">
      <QrIcon /><span>{qrMessages[language].scan}</span>
    </a>
  </div>;
}

export function WalletQrScanSession({ language, accountName, onClose, onNavigate }: {
  language: WalletLanguage; accountName: string | null; onClose: () => void; onNavigate: (href: string) => void;
}) {
  function submitted() {
    try {
      localStorage.setItem(qrTransferNotice, JSON.stringify({ accountName, at: Date.now() }));
      localStorage.removeItem(qrTransferNotice);
    } catch { /* Transfer status is still shown. */ }
  }
  return <ScannerDialog language={language} accountName={accountName} onSubmitted={submitted} onClose={onClose} onNavigate={onNavigate} />;
}

function ScannerDialog({ language, accountName, onClose, onSubmitted, onNavigate }: { language: WalletLanguage; accountName: string | null; onClose: () => void; onSubmitted: () => void; onNavigate: (href: string) => void }) {
  const t = qrMessages[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const alive = useRef(true);
  const decoded = useRef(false);
  const sending = useRef(false);
  const fileAttempt = useRef(0);
  const readingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<'scan' | 'review' | 'submitting' | 'submitted' | 'unknown' | 'rejected'>('scan');
  const [request, setRequest] = useState<QrRequest | null>(null);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [cameraMessage, setCameraMessage] = useState(t.starting);
  const [cycle, setCycle] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [flash, setFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [reading, setReading] = useState(false);
  const [txId, setTxId] = useState('');
  const busy = phase === 'submitting';

  useEffect(() => {
    alive.current = true;
    const element = dialog.current!;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { alive.current = false; fileAttempt.current++; if (readingTimer.current) clearTimeout(readingTimer.current); element.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  function accept(text: string) {
    if (!alive.current || decoded.current) return;
    decoded.current = true;
    scanner.current?.destroy(); scanner.current = null;
    setRaw(text); setError(''); setPhase('review');
    try {
      const parsed = parseQrRequest(text, accountName);
      if (parsed.kind === 'link') { onNavigate(parsed.href); return; }
      setRequest(parsed);
    }
    catch (reason) { setRequest(null); setError(t[reason instanceof QrRequestError ? reason.code : 'invalidQr']); }
  }

  useEffect(() => {
    if (phase !== 'scan') return;
    let cancelled = false;
    let instance: QrScanner | null = null;
    setCameras([]); setFlash(false); setFlashOn(false);
    if (!window.isSecureContext) { setCameraMessage(t.insecure); return; }
    setCameraMessage(t.starting);
    async function start() {
      try {
        const Qr = (await import('qr-scanner')).default;
        if (cancelled || !video.current) return;
        instance = new Qr(video.current, result => accept(result.data), {
          preferredCamera: 'environment', maxScansPerSecond: 12, returnDetailedScanResult: true,
          onDecodeError: () => {},
          calculateScanRegion: element => {
            const size = Math.floor(Math.min(element.videoWidth, element.videoHeight) * 0.9);
            const resolution = Math.min(size, 1024);
            return { x: Math.floor((element.videoWidth - size) / 2), y: Math.floor((element.videoHeight - size) / 2), width: size, height: size, downScaledWidth: resolution, downScaledHeight: resolution };
          },
        });
        scanner.current = instance;
        instance.setInversionMode('both');
        await instance.start();
        if (cancelled) { instance.destroy(); return; }
        setCameraMessage(t.aiming);
        const [hasFlash, availableCameras] = await Promise.all([instance.hasFlash(), Qr.listCameras(false)]);
        if (!cancelled) { setFlash(hasFlash); setCameras(availableCameras); }
      } catch {
        instance?.destroy();
        if (scanner.current === instance) scanner.current = null;
        if (!cancelled) setCameraMessage(t.cameraError);
      }
    }
    void start();
    return () => { cancelled = true; instance?.destroy(); if (scanner.current === instance) scanner.current = null; };
    // Language/account stay fixed for the lifetime of the native modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cycle]);

  async function readImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size > 15 * 1024 * 1024) { setError(t.invalidImage); return; }
    const attempt = ++fileAttempt.current;
    if (readingTimer.current) clearTimeout(readingTimer.current);
    decoded.current = true;
    scanner.current?.destroy(); scanner.current = null;
    setPhase('review'); setRequest(null); setError(''); setReading(true);
    const timeout = setTimeout(() => {
      if (!alive.current || fileAttempt.current !== attempt) return;
      fileAttempt.current++;
      setReading(false); setError(t.imageTimeout); readingTimer.current = null;
      console.warn('[QR IMAGE] image.read:timeout; late results ignored');
    }, 28000);
    readingTimer.current = timeout;
    try {
      const text = await readQrImage(file);
      if (alive.current && fileAttempt.current === attempt) { decoded.current = false; accept(text); }
    } catch (reason) {
      if (alive.current && fileAttempt.current === attempt) setError(reason instanceof QrImageError && reason.code === 'notFound' ? t.imageError : t.imageUnavailable);
    } finally {
      clearTimeout(timeout);
      if (readingTimer.current === timeout) readingTimer.current = null;
      if (alive.current && fileAttempt.current === attempt) setReading(false);
    }
  }

  function scanAgain() {
    if (readingTimer.current) { clearTimeout(readingTimer.current); readingTimer.current = null; }
    fileAttempt.current++; decoded.current = false; sending.current = false;
    setRequest(null); setError(''); setRaw(''); setTxId(''); setReading(false); setPhase('scan'); setCycle(value => value + 1);
  }

  async function submit() {
    if (sending.current || phase !== 'review' || request?.kind !== 'transfer') return;
    if (!window.isSecureContext) { setError(t.secureSigning); return; }
    let activePrivateKey: string | null;
    try {
      const currentAccount = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');
      if (currentAccount !== request.from) { setError(t.wrongAccount); return; }
      activePrivateKey = localStorage.getItem('innopay_activePrivate');
    } catch { setError(t.walletRequired); return; }
    if (!activePrivateKey) { setError(t.walletRequired); return; }
    sending.current = true; setError(''); setPhase('submitting');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/wallet/qr-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal,
        body: JSON.stringify({ raw, accountName: request.from, activePrivateKey }),
      });
      const result = await response.json();
      if (!alive.current) return;
      if (response.ok && result.status === 'submitted' && typeof result.txId === 'string') { setTxId(result.txId); setPhase('submitted'); onSubmitted(); }
      else if (response.status >= 400 && response.status < 500 && result.status === 'rejected') setPhase('rejected');
      else setPhase('unknown');
    } catch { if (alive.current) setPhase('unknown'); }
    finally { clearTimeout(timeout); }
    // Keep the submission latch closed on success AND uncertain outcomes. No automatic retry.
  }

  return <dialog ref={dialog} className="hub-qr-dialog" aria-labelledby="hub-qr-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="hub-qr-content">
      <div className="hub-qr-heading"><h2 id="hub-qr-title">{t.title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={t.close}>×</button></div>
      {phase === 'scan' && <>
        <div className="hub-qr-camera"><video ref={video} muted playsInline aria-label={t.camera} /><div className="hub-qr-reticle" aria-hidden="true" /></div>
        <p role="status">{cameraMessage}</p>
        <div className="hub-qr-tools">
          {cameras.length > 1 && <label>{t.camera}<select defaultValue="" onChange={async event => {
            const current = scanner.current; if (!current) return;
            try { await current.setCamera(event.target.value); if (alive.current) { setFlash(await current.hasFlash()); setFlashOn(false); } }
            catch { if (alive.current) setCameraMessage(t.cameraError); }
          }}><option value="" disabled>{t.camera}</option>{cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{camera.label || `${t.camera} ${index + 1}`}</option>)}</select></label>}
          {flash && <button type="button" aria-pressed={flashOn} onClick={async () => {
            try { await scanner.current?.toggleFlash(); if (alive.current) setFlashOn(scanner.current?.isFlashOn() ?? false); }
            catch { if (alive.current) setFlash(false); }
          }}>{t.torch}</button>}
          <button type="button" onClick={() => setCycle(value => value + 1)}>{t.useCamera}</button>
        </div>
      </>}
      {error && <p role="alert" className="hub-qr-error">{error}</p>}
      {reading && <p role="status">{t.reading}</p>}
      {request?.kind === 'transfer' && <div className="hub-qr-review">
        <h3>{t.transferTitle}</h3><p className="hub-qr-amount"><bdi>{request.amount} {request.asset}</bdi></p>
        <dl><dt>{t.from}</dt><dd><bdi>{request.from}</bdi></dd><dt>{t.to}</dt><dd><bdi>{request.to}</bdi></dd><dt>{t.memo}</dt><dd className="hub-qr-memo">{request.memo || t.noMemo}</dd></dl>
        {phase === 'review' && <button type="button" className="hub-qr-primary" onClick={submit}>{t.confirm}</button>}
      </div>}
      {phase === 'submitting' && <p role="status">{t.signing}</p>}
      {phase === 'submitted' && <div role="status" className="hub-qr-result"><p>{t.submitted}</p><p>{t.txId}</p><code>{txId}</code></div>}
      {phase === 'unknown' && <p role="alert" className="hub-qr-error">{t.unknown}</p>}
      {phase === 'rejected' && <p role="alert" className="hub-qr-error">{t.rejected}</p>}
      {!busy && <div className="hub-qr-actions">
        {phase !== 'scan' && <button type="button" onClick={scanAgain}>{t.scanAgain}</button>}
        {phase === 'scan' && <button type="button" onClick={() => imageInput.current?.click()}>{t.image}</button>}
        {!accountName && <a href="/user?choice=import">{t.importWallet}</a>}
      </div>}
      <input ref={imageInput} type="file" accept="image/*" hidden aria-label={t.image} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readImage(file); }} />
    </div>
  </dialog>;
}
