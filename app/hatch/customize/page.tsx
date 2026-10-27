'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import LogoCropper from '@/app/components/LogoCropper';

interface FarmVendor {
  handle: string;
  display_name: string;
  hive_account: string;
  is_active: boolean;
  logo_url: string | null;
}

function CustomizeVendorLogo() {
  const params = useSearchParams();
  const requestedHandle = params.get('handle');
  const [vendors, setVendors] = useState<FarmVendor[]>([]);
  const [handle, setHandle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const vendor = vendors.find((item) => item.handle === handle);

  useEffect(() => {
    fetch('/api/hatch/vendors')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load vendors');
        const rows = data.vendors as FarmVendor[];
        setVendors(rows);
        setHandle(rows.find((item) => item.handle === requestedHandle && item.is_active)?.handle ??
          rows.find((item) => item.is_active)?.handle ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load vendors'));
  }, [requestedHandle]);

  async function changeLogo(method: 'POST' | 'DELETE') {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = method === 'POST' && file ? new FormData() : undefined;
      if (body && file) body.set('logo', file);
      const response = await fetch(`/api/hatch/vendors/${encodeURIComponent(vendor.handle)}/logo`, { method, body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save logo');
      setVendors((rows) => rows.map((item) => item.handle === vendor.handle ? { ...item, logo_url: data.logo_url } : item));
      setFile(null);
      setMessage(method === 'POST' ? 'Logo saved. Reload the till to see it.' : 'Logo removed from the till.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save logo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 sm:p-6">
      <a href="/hatch" className="text-sm text-blue-700 underline">← Hatch</a>
      <h1 className="text-2xl font-bold">Vendor logos</h1>
      <p className="text-sm text-stone-600">Choose an active vendor, then add or replace the small logo shown on its till.</p>
      <label className="block text-sm font-semibold">
        Vendor
        <select value={handle} onChange={(event) => { setHandle(event.target.value); setFile(null); setMessage(null); }}
          className="mt-1 w-full rounded-lg border p-3">
          {!handle && <option value="">Choose a vendor</option>}
          {vendors.filter((item) => item.is_active).map((item) => (
            <option key={item.handle} value={item.handle}>{item.display_name} · /{item.handle} · @{item.hive_account}</option>
          ))}
        </select>
      </label>
      {vendor && (
        <section className="rounded-xl border bg-white p-4">
          {vendor.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.logo_url} alt={`${vendor.display_name} logo`} className="h-20 w-20 rounded-lg border object-contain p-1" />
          )}
          <p className="mt-3 text-sm text-stone-600">Choose a PNG, JPEG or WebP source up to 20 MB, then crop a circular logo.</p>
          <div className="mt-3"><LogoCropper key={`${handle}:${vendor.logo_url ?? 'new'}`} onCropped={setFile} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => changeLogo('POST')} disabled={!file || file.size > 1_000_000 || busy}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Saving…' : vendor.logo_url ? 'Replace logo' : 'Save logo'}
            </button>
            {vendor.logo_url && <button type="button" onClick={() => changeLogo('DELETE')} disabled={busy}
              className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Remove logo</button>}
          </div>
        </section>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </main>
  );
}

export default function HatchCustomizePage() {
  return <Suspense fallback={<main className="p-6">Loading vendors…</main>}><CustomizeVendorLogo /></Suspense>;
}
