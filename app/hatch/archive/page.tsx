'use client';

import { useCallback, useEffect, useState } from 'react';

interface Vendor {
  handle: string;
  display_name: string;
  hive_account: string;
  is_active: boolean;
}

export default function VendorArchivePage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Vendor | null>(null);
  const [typedHandle, setTypedHandle] = useState('');
  const [paymentChecked, setPaymentChecked] = useState(false);

  useEffect(() => {
    setSelectedHandle(new URLSearchParams(window.location.search).get('handle'));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/hatch/vendors', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load vendors');
      setVendors(data.vendors ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!loading && selectedHandle) {
      document.getElementById(`vendor-${selectedHandle}`)?.scrollIntoView({ block: 'center' });
    }
  }, [loading, selectedHandle]);

  function requestArchive(vendor: Vendor) {
    setConfirming(vendor);
    setTypedHandle('');
    setPaymentChecked(false);
    setError(null);
  }

  async function change(vendor: Vendor) {
    const action = vendor.is_active ? 'archive' : 'unarchive';
    setWorking(vendor.handle);
    setError(null);
    try {
      const response = await fetch(`/api/hatch/vendors/${encodeURIComponent(vendor.handle)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'archive' ? {
            confirmHandle: typedHandle,
            acknowledgedNoPaymentInProgress: paymentChecked,
          } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(
        `${data.error || 'Update failed'}${data.completed?.length ? ` (completed: ${data.completed.join(', ')})` : ''}. Retry this action.`,
      );
      setConfirming(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setWorking(null);
    }
  }

  const active = vendors.filter((v) => v.is_active);
  const archived = vendors.filter((v) => !v.is_active);

  function section(title: string, rows: Vendor[]) {
    return (
      <section className="mt-7">
        <h2 className="text-lg font-bold">{title} ({rows.length})</h2>
        {rows.length === 0 && <p className="mt-2 text-sm text-stone-500">None</p>}
        <ul className="mt-3 space-y-3">
          {rows.map((vendor) => (
            <li id={`vendor-${vendor.handle}`} key={vendor.handle} className={`rounded-xl border bg-white p-4 ${
              selectedHandle === vendor.handle ? 'border-amber-500 ring-2 ring-amber-200' : ''
            }`}>
              <div className="font-semibold">{vendor.display_name}</div>
              <div className="mt-1 text-sm text-stone-600">
                /{vendor.handle} · @{vendor.hive_account}
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm">
                {vendor.is_active && (
                  <a href={`https://pay.innopay.lu/${vendor.handle}`} className="text-blue-700 underline">
                    Vendor page
                  </a>
                )}
                <button type="button" disabled={working !== null}
                  onClick={() => vendor.is_active ? requestArchive(vendor) : change(vendor)}
                  className={`rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50 ${
                    vendor.is_active ? 'bg-stone-700' : 'bg-emerald-700'
                  }`}>
                  {working === vendor.handle ? 'Updating…' : vendor.is_active ? 'Archive' : 'Unarchive'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/hatch" className="text-sm text-blue-700 underline">← Hatch a vendor</a>
      <h1 className="mt-4 text-2xl font-bold">Vendor archive</h1>
      <p className="mt-2 text-sm text-stone-600">
        Archived vendors disappear from the Farm directory. Their till and payment pages stop working;
        their records, catalogue and history remain available after unarchiving.
      </p>
      <p className="mt-2 text-sm text-amber-800">
        Check that no customer payment is in progress before archiving. A card checkout already started
        may need manual reconciliation. Archiving cannot prevent a direct transfer to a public Hive address.
      </p>
      {selectedHandle && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Selected from the Farm catalogue: <strong>/{selectedHandle}</strong>. Review the matching row before archiving.
      </p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="mt-5 text-sm">Loading vendors…</p> : <>{section('Active vendors', active)}{section('Archived vendors', archived)}</>}
      {confirming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="archive-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
          <h2 id="archive-title" className="text-xl font-bold">Archive {confirming.display_name}?</h2>
          <p className="mt-2 text-sm text-stone-700">
            This disables /{confirming.handle}, its till and new app-mediated payments for @{confirming.hive_account}.
          </p>
          <label className="mt-4 flex gap-2 text-sm">
            <input type="checkbox" checked={paymentChecked} onChange={(e) => setPaymentChecked(e.target.checked)} />
            <span>I checked that no customer payment is in progress.</span>
          </label>
          <label className="mt-4 block text-sm font-semibold" htmlFor="archive-handle">
            Type {confirming.handle} to confirm
          </label>
          <input id="archive-handle" autoComplete="off" spellCheck={false} value={typedHandle}
            onChange={(e) => setTypedHandle(e.target.value)}
            className="mt-1 w-full rounded-lg border p-2" />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={working !== null} onClick={() => setConfirming(null)}
              className="rounded-lg border px-3 py-2">Cancel</button>
            <button type="button" disabled={working !== null || !paymentChecked || typedHandle !== confirming.handle}
              onClick={() => change(confirming)}
              className="rounded-lg bg-stone-800 px-3 py-2 font-semibold text-white disabled:opacity-50">
              {working ? 'Archiving…' : 'Archive vendor'}
            </button>
          </div>
        </div>
      </div>}
    </main>
  );
}
