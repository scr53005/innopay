'use client';

// The hatch flow (unit 3d) — behind the operator gate (middleware.ts).
// Nacho fills business name + Hive account name + category + IBAN, submits,
// and the orchestration creates the account, allocates the V:, wires the
// registry + merchant-hub + innohatch, and returns the till URL to hand over.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { validateHiveAccountName } from '@/lib/hive-account-name';

// Fallback categories if the innohatch templates list can't be fetched (dev/offline).
const FALLBACK_CATEGORIES = [
  { key: 'coffee_cart', name: 'Coffee cart' },
  { key: 'food_truck', name: 'Food truck' },
  { key: 'buvette', name: 'Buvette / fête' },
];

// Sentinel dropdown value for "Create new category".
const NEW_CATEGORY = '__new__';

interface NewItem {
  kind: 'dish' | 'drink';
  label: string;
  price: string; // free-typed; coerced to number on submit
}

// Valid-format but non-real LU specimen IBAN — evocative demo default.
const SPECIMEN_IBAN = 'LU28 0019 4006 4475 0000';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mock (skip the real chain broadcast) is a DEV-ONLY convenience. Hide the checkbox
// in prod (the server refuses it there regardless). Prod = the env var says so, or
// we're actually served from the prod hub host.
function isProdHatch(): boolean {
  if (process.env.NEXT_PUBLIC_ENV === 'prod') return true;
  if (typeof window !== 'undefined' && window.location.hostname === 'wallet.innopay.lu') return true;
  return false;
}

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
  const [categories, setCategories] = useState<{ key: string; name: string }[]>(FALLBACK_CATEGORIES);
  // "Create new category" mini-form state.
  const [newName, setNewName] = useState('');
  const [newItems, setNewItems] = useState<NewItem[]>([{ kind: 'drink', label: '', price: '' }]);
  const [iban, setIban] = useState(SPECIMEN_IBAN);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HatchResult | null>(null);

  // Live Hive account-name validation (format now, availability debounced) —
  // lifted from the customer account-creation flow (app/user/page.tsx).
  const [nameMsg, setNameMsg] = useState('');
  const [nameOk, setNameOk] = useState(false);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMock = !isProdHatch();

  // Load the category list from innohatch (via the operator-gated hub proxy).
  useEffect(() => {
    fetch('/api/hatch/templates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.templates) && d.templates.length) setCategories(d.templates);
      })
      .catch(() => {});
  }, []);

  const creatingCategory = templateKey === NEW_CATEGORY;
  const validNewItems = newItems.filter((i) => i.label.trim() && Number.isFinite(Number(i.price)));
  const newCategoryReady = creatingCategory ? newName.trim().length > 0 && validNewItems.length > 0 : true;

  const setItem = (idx: number, patch: Partial<NewItem>) =>
    setNewItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  function onHiveAccountChange(raw: string) {
    const value = raw.toLowerCase();
    setHiveAccount(value);

    if (value.length === 0) {
      setNameMsg('');
      setNameOk(false);
      return;
    }
    const { valid, message } = validateHiveAccountName(value);
    if (!valid) {
      setNameMsg(message);
      setNameOk(false);
      return;
    }
    // Format is good — optimistic success, then confirm availability on chain.
    setNameMsg('Looks good — checking availability…');
    setNameOk(true);
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/haf-accounts/check?accountName=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (data.available === false) {
          setNameMsg('That account name is already taken — choose another.');
          setNameOk(false);
        } else {
          setNameMsg('Available ✓');
          setNameOk(true);
        }
      } catch {
        // HAF unreachable → keep optimistic; the create call verifies on chain anyway.
        setNameMsg('Format OK (availability check unavailable)');
        setNameOk(true);
      }
    }, 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // "Create new category" → send new_template (name + items); else template_key.
      const categoryPayload = creatingCategory
        ? {
            new_template: {
              name: newName.trim(),
              items: validNewItems.map((i) => ({
                kind: i.kind,
                label: i.label.trim(),
                price_eur: Number(i.price),
              })),
            },
          }
        : { template_key: templateKey };

      const res = await fetch('/api/hatch/create-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          hive_account: hiveAccount,
          ...categoryPayload,
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
          setNameMsg('');
          setNameOk(false);
          setTemplateKey('coffee_cart');
          setNewName('');
          setNewItems([{ kind: 'drink', label: '', price: '' }]);
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
            onChange={(e) => onHiveAccountChange(e.target.value)}
            placeholder="monterey-cart" className="mt-1 w-full rounded-lg border p-3 font-mono" />
          <span className="text-xs text-gray-400">3–16 chars, lowercase, digits, dots, hyphens. Used as the till URL slug.</span>
          {nameMsg && (
            <span className={`mt-1 block text-xs ${nameOk ? 'text-emerald-600' : 'text-red-600'}`}>{nameMsg}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Category</span>
          <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3">
            {categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            <option value={NEW_CATEGORY}>➕ Create new category…</option>
          </select>
        </label>

        {/* "Create new category" mini-form: name + a few starter dishes/drinks. The
            new category is saved (slug-deduped) and reusable on future hatches. */}
        {creatingCategory && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <label className="block">
              <span className="text-sm font-semibold">New category name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Crêperie" className="mt-1 w-full rounded-lg border p-2" />
              <span className="text-xs text-gray-500">
                Reusable on future hatches. Accent-insensitive: “Crêperie” and “Creperie”
                are the same category.
              </span>
            </label>

            <div className="space-y-2">
              <span className="text-sm font-semibold">Starter items</span>
              {newItems.map((it, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <select value={it.kind} onChange={(e) => setItem(idx, { kind: e.target.value as 'dish' | 'drink' })}
                    className="rounded border p-2 text-sm">
                    <option value="drink">B</option>
                    <option value="dish">D</option>
                  </select>
                  <input value={it.label} onChange={(e) => setItem(idx, { label: e.target.value })}
                    placeholder="Crêpe sucrée" className="min-w-0 flex-1 rounded border p-2 text-sm" />
                  <input value={it.price} onChange={(e) => setItem(idx, { price: e.target.value })}
                    inputMode="decimal" placeholder="€" className="w-16 rounded border p-2 text-sm" />
                  <button type="button" disabled={newItems.length <= 1}
                    onClick={() => setNewItems((r) => r.filter((_, i) => i !== idx))}
                    className="shrink-0 rounded border px-2 py-1 text-xs text-red-600 disabled:opacity-30">✕</button>
                </div>
              ))}
              <button type="button"
                onClick={() => setNewItems((r) => [...r, { kind: 'drink', label: '', price: '' }])}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold">+ Add item</button>
            </div>
          </div>
        )}
        <label className="block">
          <span className="text-sm font-semibold">IBAN (payout — optional)</span>
          <input value={iban} onChange={(e) => setIban(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3 font-mono" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Vendor email <span className="text-red-500">*</span></span>
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder="owner@example.com" className="mt-1 w-full rounded-lg border p-3" />
          <span className="text-xs text-gray-400">
            Required — our channel to the vendor. They’re emailed a one-time link to
            retrieve their own account credentials (needed to log into their menu
            &amp; history).
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
        {showMock && (
          <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} className="mt-1" />
            <span className="text-sm text-amber-800">
              <b>Mock</b> — test the wiring only. No real Hive account is created
              (the vendor can’t receive real payments). Uncheck to create a real
              account. <i>(Dev only — refused in production.)</i>
            </span>
          </label>
        )}
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button type="submit" disabled={busy || !displayName || !nameOk || !EMAIL_RE.test(email) || !newCategoryReady}
          className="w-full rounded-lg bg-emerald-600 py-3 font-bold text-white disabled:opacity-50">
          {busy ? 'Creating…' : 'Create new vendor'}
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
