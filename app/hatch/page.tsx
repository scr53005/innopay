'use client';

// The hatch flow (unit 3d) — behind the operator gate (middleware.ts).
// Nacho fills business name + Hive account name + category + IBAN, submits,
// and the orchestration creates the account, allocates the V:, wires the
// registry + merchant-hub + innohatch, and returns the till URL to hand over.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const CATEGORIES = [
  { key: 'coffee_cart', label: 'Coffee cart (espresso, double, cappuccino, latte)' },
  { key: 'food_truck', label: 'Food truck (burger, cheeseburger, beer)' },
  { key: 'buvette', label: 'Buvette / fête (soft, water, juice)' },
];

// Valid-format but non-real LU specimen IBAN — evocative demo default.
const SPECIMEN_IBAN = 'LU28 0019 4006 4475 0000';

interface HatchResult {
  account: string;
  display_name: string;
  memo_vendor_id: number;
  env: string;
  email: string | null;
  credentials?: string; // e.g. 'sent' | 'skipped (no email)' | 'failed (...)'
  till_url: string;
  pay_url: string;
}

export default function HatchPage() {
  const [displayName, setDisplayName] = useState('');
  const [hiveAccount, setHiveAccount] = useState('');
  const [templateKey, setTemplateKey] = useState('coffee_cart');
  const [iban, setIban] = useState(SPECIMEN_IBAN);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HatchResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hatch/create-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          hive_account: hiveAccount,
          template_key: templateKey,
          iban,
          email,
          phone,
          mock,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(`${data.error}${data.steps ? ` — completed: ${JSON.stringify(data.steps)}` : ''}`);
      }
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  if (result) {
    return (
      <HatchResultView
        result={result}
        onAgain={() => {
          setResult(null);
          setDisplayName('');
          setHiveAccount('');
          setIban(SPECIMEN_IBAN);
          setEmail('');
          setPhone('');
          setMock(false);
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">🐣 Hatch a vendor</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Business name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Monterey Coffee Cart" className="mt-1 w-full rounded-lg border p-3" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Hive account name</span>
          <input value={hiveAccount}
            onChange={(e) => setHiveAccount(e.target.value.toLowerCase())}
            placeholder="monterey-cart" className="mt-1 w-full rounded-lg border p-3 font-mono" />
          <span className="text-xs text-gray-400">3–16 chars, lowercase, digits, dots, hyphens. Used as the till URL slug.</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Category</span>
          <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3">
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">IBAN (payout — optional)</span>
          <input value={iban} onChange={(e) => setIban(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3 font-mono" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Vendor email (optional)</span>
          <input type="email" value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder="owner@example.com" className="mt-1 w-full rounded-lg border p-3" />
          <span className="text-xs text-gray-400">
            If given, the vendor is emailed a one-time link to retrieve their own
            account credentials (needed to log into their menu &amp; history). Can be
            added later by re-hatching the same account.
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Vendor phone (optional)</span>
          <input type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+352 621 123 456" className="mt-1 w-full rounded-lg border p-3" />
          <span className="text-xs text-gray-400">
            Full international format with country code (+352, +33, +32, +49, +39,
            +34, …). A second channel to secure the account against email compromise
            (future SMS 2FA). Stored on the person, not the till.
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
          <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} className="mt-1" />
          <span className="text-sm text-amber-800">
            <b>Mock</b> — test the wiring only. No real Hive account is created
            (the vendor can’t receive real payments). Uncheck to create a real
            account.
          </span>
        </label>
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button type="submit" disabled={busy || !displayName || !hiveAccount}
          className="w-full rounded-lg bg-emerald-600 py-3 font-bold text-white disabled:opacity-50">
          {busy ? 'Hatching…' : 'Hatch'}
        </button>
      </form>
    </main>
  );
}

function HatchResultView({ result, onAgain }: { result: HatchResult; onAgain: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(result.till_url, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [result.till_url]);

  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-2xl font-bold">🐣 Hatched: {result.display_name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Account <code>@{result.account}</code> · vendor #{result.memo_vendor_id} · {result.env}
      </p>

      {/* Credential-retrieval status: tells the operator whether the vendor can log in yet */}
      <div className="mx-auto mt-3 max-w-sm rounded-lg border p-3 text-left text-sm">
        <span className="font-semibold">Vendor credentials: </span>
        {result.credentials === 'sent' ? (
          <span className="text-emerald-700">
            ✉️ retrieval link emailed to {result.email}
          </span>
        ) : result.credentials?.startsWith('skipped') ? (
          <span className="text-gray-500">
            not sent ({result.credentials.replace('skipped ', '')}) — re-hatch with
            an email to send it.
          </span>
        ) : (
          <span className="text-red-600">{result.credentials || 'unknown'}</span>
        )}
      </div>

      {/* Generous till QR — the vendor scans it with their phone */}
      <div className="mx-auto mt-5 max-w-sm rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">📲 Scan with the vendor’s phone</div>
        <div className="mt-1 text-xs text-gray-500">
          Opens their till, then tap <b>Install</b> / <b>Add to Home Screen</b> to
          put the app on the phone.
        </div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Till QR" className="mx-auto mt-3 w-full max-w-xs" />
        ) : (
          <div className="mt-3 h-64 animate-pulse rounded bg-gray-100" />
        )}
        <a className="mt-2 block break-all text-xs text-blue-600 underline" href={result.till_url}>{result.till_url}</a>
      </div>

      <div className="mx-auto mt-4 max-w-sm rounded-lg border bg-white p-3 text-left">
        <div className="text-xs font-semibold text-gray-500">CUSTOMER PAY PAGE (put on the table/counter QR)</div>
        <a className="break-all text-blue-600 underline" href={result.pay_url}>{result.pay_url}</a>
      </div>

      <button onClick={onAgain} className="mt-6 w-full max-w-sm rounded-lg border py-3 font-semibold">
        Hatch another
      </button>
    </main>
  );
}
