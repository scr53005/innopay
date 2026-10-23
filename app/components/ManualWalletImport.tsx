'use client';

import { useEffect, useRef, useState } from 'react';
import { importManualWallet } from '@/lib/manual-wallet-import';
import { walletRecoveryMessages } from '@/lib/wallet-recovery-messages';
import type { WalletImport } from '@/lib/wallet-import';

export default function ManualWalletImport({ accountName: initialAccount = '', requiredAccountName, language = 'en', onImport, onBack }: {
  accountName?: string;
  requiredAccountName?: string;
  language?: keyof typeof walletRecoveryMessages;
  onImport: (wallet: WalletImport) => void | Promise<void>;
  onBack: () => void;
}) {
  const [accountName, setAccountName] = useState(requiredAccountName || initialAccount);
  const [active, setActive] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = walletRecoveryMessages[language];
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const wallet = await importManualWallet(accountName, active, memo, requiredAccountName);
      if (!mounted.current) return;
      await onImport(wallet);
      if (mounted.current) { setActive(''); setMemo(''); }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Wallet import failed. Please try again.');
    } finally { if (mounted.current) setBusy(false); }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-gray-900';
  return (
    <section aria-label={t.title} className="space-y-4 text-gray-800">
      <h3 className="text-lg font-bold">{t.title}</h3>
      <p className="text-sm text-gray-600">{t.help}</p>
      <label className="block text-sm font-medium">{t.account}
        <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} readOnly={!!requiredAccountName}
          disabled={busy} autoCapitalize="none" spellCheck={false} autoComplete="off" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">{t.active}
        <input type="password" value={active} onChange={e => setActive(e.target.value)} disabled={busy}
          autoComplete="new-password" autoCapitalize="none" spellCheck={false} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">{t.memo}
        <input type="password" value={memo} onChange={e => setMemo(e.target.value)} disabled={busy}
          autoComplete="new-password" autoCapitalize="none" spellCheck={false} className={inputClass} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={submit} disabled={busy || !accountName.trim() || !active.trim() || !memo.trim()}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? t.checking : t.submit}
      </button>
      <button type="button" disabled={busy} onClick={onBack} className="w-full text-sm text-blue-700 disabled:opacity-50">{t.back}</button>
    </section>
  );
}
