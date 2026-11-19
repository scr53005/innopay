'use client';

// /user/email — "I no longer have access to my email" (HUB-USER-FEATURES-PLAN §2, A1).
// The wallet on this device signs the request (no prompt: the key is already here), a code
// goes to the NEW address, the customer types it back, done. Without the wallet on this
// device there is nothing to sign with: the page points to contact@innopay.lu instead.

import { useEffect, useState } from 'react';
import { newAccountProofNonce, signAccountProof } from '@/lib/account-proof';
import { emailChangeErrorKey, emailChangeMessages, type EmailChangeLanguage } from '@/lib/email-change-messages';

type Step = 'loading' | 'no-wallet' | 'enter-email' | 'enter-code' | 'done';

export default function ChangeEmailPage() {
  const [step, setStep] = useState<Step>('loading');
  const [language, setLanguage] = useState<EmailChangeLanguage>('fr');
  const [account, setAccount] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const lang = localStorage.getItem('innopay_language');
      if (lang === 'en' || lang === 'fr' || lang === 'de' || lang === 'lb') setLanguage(lang);
      const acc = localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName') || '';
      const key = localStorage.getItem('innopay_activePrivate') || '';
      setAccount(acc);
      setActiveKey(key);
      setCurrentEmail(localStorage.getItem('innopay_email') || '');
      setStep(acc && key ? 'enter-email' : 'no-wallet');
    } catch {
      setStep('no-wallet');
    }
  }, []);

  const t = emailChangeMessages[language];

  const fail = (status: number, data: { error?: string; retryAfter?: number; attemptsLeft?: number }) => {
    const key = emailChangeErrorKey(status, data.error);
    setError(t.errors[key]
      .replace('{s}', String(data.retryAfter ?? 60))
      .replace('{n}', String(data.attemptsLeft ?? 0)));
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const email = newEmail.trim().toLowerCase();
      const fields = { purpose: 'email-change' as const, account, payload: email, ts: Date.now(), nonce: newAccountProofNonce() };
      const signature = signAccountProof(fields, activeKey);
      const response = await fetch('/api/email-change/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, newEmail: email, ts: fields.ts, nonce: fields.nonce, signature, language }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return fail(response.status, data);
      setNewEmail(email);
      setStep('enter-code');
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/email-change/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, newEmail, code: code.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return fail(response.status, data);
      try { localStorage.setItem('innopay_email', data.email || newEmail); } catch { /* display cache only */ }
      setStep('done');
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-start justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-xl font-bold text-blue-900">{t.title}</h1>

        {step === 'loading' && <p className="text-gray-500">…</p>}

        {step === 'no-wallet' && (
          <p className="text-gray-700">
            {t.noWallet} <a className="text-blue-700 underline" href="mailto:contact@innopay.lu">contact@innopay.lu</a>
          </p>
        )}

        {step === 'enter-email' && (
          <form onSubmit={requestCode} className="space-y-3">
            <p className="text-sm text-gray-700">{t.intro}</p>
            <p className="text-sm text-gray-600">
              <span className="font-mono">{account}</span>
              {currentEmail && <> · {t.current} <span className="font-mono break-all">{currentEmail}</span></>}
            </p>
            <label className="block text-sm font-medium text-gray-700" htmlFor="new-email">{t.newEmailLabel}</label>
            <input id="new-email" type="email" required autoComplete="email" value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 text-gray-900" />
            <button type="submit" disabled={busy || !newEmail.trim()}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5">
              {busy ? '…' : t.sendCode}
            </button>
          </form>
        )}

        {step === 'enter-code' && (
          <form onSubmit={confirmCode} className="space-y-3">
            <p className="text-sm text-gray-700">{t.codeSent} <span className="font-mono break-all">{newEmail}</span></p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-gray-300 p-2 text-center font-mono text-2xl tracking-[0.4em] text-gray-900" />
            <button type="submit" disabled={busy || code.length !== 6}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5">
              {busy ? '…' : t.confirm}
            </button>
            <button type="button" onClick={() => { setStep('enter-email'); setCode(''); setError(''); }}
              className="w-full text-sm text-blue-700 underline">{t.back}</button>
          </form>
        )}

        {step === 'done' && (
          <p className="text-green-700 font-semibold">{t.done} <span className="font-mono break-all">{newEmail}</span></p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <a href="/user" className="block text-center text-sm text-gray-600 underline">{t.backToWallet}</a>
      </div>
    </main>
  );
}
