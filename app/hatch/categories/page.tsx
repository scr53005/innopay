'use client';

import { useCallback, useEffect, useState } from 'react';

interface Starter { kind: 'dish' | 'drink'; label: string; price_eur: number }
interface Category { key: string; name: string; is_active: boolean; items: Starter[] }
interface DraftItem { kind: 'dish' | 'drink'; label: string; price: string }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/hatch/templates?all=1', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(r.status === 401 ? 'Session expired. Reload to sign in.' : d.error || 'Could not load categories.');
    setCategories(d.templates);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [load]);

  async function change(key: string | null, method: string, body?: unknown): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch(`/api/hatch/templates${key ? `/${encodeURIComponent(key)}` : ''}`, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(r.status === 401 ? 'Session expired. Reload to sign in.' : d.error || 'Could not save category.');
      setNotice('Category saved. Existing vendor menus are unchanged.');
      setEditing(null);
      await load();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save category.'); return false; }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-2xl p-3 sm:p-4">
    <a href="/hatch" className="text-sm text-blue-700 underline">← Hatch a vendor</a>
    <div className="mt-2 flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold">Vendor categories</h1>
      <button onClick={() => { setEditing('new'); setError(''); setNotice(''); }} disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">+ Category</button>
    </div>
    <p className="mt-1 text-sm text-gray-600">Starter menus for future hatches. Editing or archiving a category does not change existing vendors.</p>
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm text-emerald-700">{notice}</p>}
    {editing !== null && <CategoryForm key={editing === 'new' ? 'new' : editing.key} category={editing === 'new' ? null : editing} busy={busy}
      onCancel={() => setEditing(null)} onSave={(name, items) => change(editing === 'new' ? null : editing.key, editing === 'new' ? 'POST' : 'PATCH', { name, items })} />}
    {loading ? <p className="mt-3 text-sm">Loading…</p> : <ul className="mt-3 divide-y rounded-lg border">
      {categories.filter((c) => showArchived || c.is_active).map((c) => <li key={c.key} className={`flex items-center gap-2 p-2 ${c.is_active ? '' : 'bg-gray-50 text-gray-500'}`}>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{c.name}</div><div className="text-xs text-gray-500">{c.items.length} starter products{!c.is_active && ' · Archived'}</div></div>
        <button disabled={busy} onClick={() => { setEditing(c); setError(''); setNotice(''); }} className="rounded border px-2 py-1.5 text-xs">Edit</button>
        <button disabled={busy} onClick={() => {
          if (c.is_active && !confirm(`Archive “${c.name}”? It will be hidden from new hatches. Existing vendors keep their menus.`)) return;
          void change(c.key, c.is_active ? 'DELETE' : 'PATCH', c.is_active ? undefined : { is_active: true });
        }} className="rounded border px-2 py-1.5 text-xs">{c.is_active ? 'Archive' : 'Restore'}</button>
      </li>)}
      {categories.filter((c) => showArchived || c.is_active).length === 0 && <li className="p-2 text-sm text-gray-500">No categories to display.</li>}
    </ul>}
    <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived categories</label>
  </main>;
}

function CategoryForm({ category, busy, onSave, onCancel }: {
  category: Category | null; busy: boolean;
  onSave: (name: string, items: Starter[]) => Promise<boolean>; onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [rows, setRows] = useState<DraftItem[]>(category?.items.map((i) => ({ kind: i.kind, label: i.label, price: String(i.price_eur) })) ?? [{ kind: 'dish', label: '', price: '' }]);
  const [error, setError] = useState('');
  function edit(index: number, patch: Partial<DraftItem>) { setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r)); }
  return <form className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3" onSubmit={async (e) => {
    e.preventDefault(); setError('');
    if (rows.some((r) => !r.label.trim() || !/^\d{1,4}(?:[.,]\d{1,2})?$/.test(r.price.trim()) || Number(r.price.replace(',', '.')) > 9999)) {
      setError('Each starter product needs a name and price (at most two decimals).'); return;
    }
    await onSave(name.trim(), rows.map((r) => ({ kind: r.kind, label: r.label.trim(), price_eur: Number(r.price.replace(',', '.')) })));
  }}>
    <label className="block text-sm font-semibold">{category ? 'Edit category' : 'New category'}
      <input autoFocus required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Market stall" className="mt-1 w-full rounded border bg-white p-2 font-normal" />
    </label>
    <p className="text-xs text-gray-600">Starter products and default prices. Vendors can adjust their own menu after hatching.</p>
    {rows.map((r, i) => <div key={i} className="flex items-center gap-1.5">
      <select aria-label={`Product ${i + 1} type`} value={r.kind} onChange={(e) => edit(i, { kind: e.target.value as Starter['kind'] })} className="rounded border bg-white p-2 text-xs"><option value="dish">Dish / item</option><option value="drink">Drink</option></select>
      <input aria-label={`Product ${i + 1} label`} required maxLength={80} value={r.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="Product" className="min-w-0 flex-1 rounded border bg-white p-2 text-sm" />
      <input aria-label={`Product ${i + 1} price in euros`} required inputMode="decimal" value={r.price} onChange={(e) => edit(i, { price: e.target.value })} placeholder="€" className="w-16 rounded border bg-white p-2 text-sm" />
      <button type="button" aria-label={`Remove product ${i + 1}`} disabled={rows.length === 1 || busy} onClick={() => setRows((prev) => prev.filter((_, n) => n !== i))} className="rounded border px-2 py-1.5 text-red-700 disabled:opacity-30">×</button>
    </div>)}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" disabled={busy || rows.length >= 60} onClick={() => setRows((prev) => [...prev, { kind: 'dish', label: '', price: '' }])} className="rounded border bg-white px-2 py-1.5 text-xs">+ Product</button>
      <div className="flex gap-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded border px-3 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">{busy ? 'Saving…' : 'Save category'}</button></div>
    </div>
  </form>;
}
