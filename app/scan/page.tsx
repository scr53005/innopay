'use client';

import React, { useEffect, useState } from 'react';
import { WalletQrScanSession } from '../components/WalletQrScanner';
import { qrMessages } from '../../lib/qr-messages';
import type { WalletLanguage } from '../../lib/wallet-navigation';

/** Opened by a normal new-tab link, so later asynchronous decoding needs no popup. */
export default function ScanPage() {
  const [settings, setSettings] = useState<{ language: WalletLanguage; accountName: string | null } | null>(null);
  useEffect(() => {
    let language: WalletLanguage = 'fr';
    let accountName: string | null = null;
    try {
      const saved = localStorage.getItem('innopay_language');
      if (saved && ['fr', 'en', 'de', 'lb'].includes(saved)) language = saved as WalletLanguage;
      accountName = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName');
    } catch { /* Link scanning also works without browser storage. */ }
    setSettings({ language, accountName });
  }, []);
  function close() {
    window.close();
    if (!window.closed) window.location.replace('/');
  }
  return <main className="wallet-hub-page" aria-label={settings ? qrMessages[settings.language].title : 'Innopay'}>
    <a href="/" className="hub-home-link" aria-label="Innopay"><img src="/innopay-compact.svg" alt="Innopay" width="40" height="40" /></a>
    {settings && <WalletQrScanSession language={settings.language} accountName={settings.accountName} onClose={close}
      onNavigate={href => window.location.replace(href)} />}
  </main>;
}
