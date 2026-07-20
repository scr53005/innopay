'use client';

// Operator login for the hatch flow. useSearchParams() requires a Suspense
// boundary (innopay CLAUDE.md convention — build fails without it).
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hatch/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(params.get('returnUrl') || '/hatch');
        return;
      }
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Login failed');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-bold">🐣 Innopay Farm — Operator</h1>
      <p className="mt-1 text-sm text-gray-500">Hatch a new vendor.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Operator password"
          autoFocus
          className="w-full rounded-lg border p-3"
        />
        {error && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="w-full rounded-lg bg-emerald-600 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? '…' : 'Enter'}
        </button>
      </form>
    </main>
  );
}

export default function HatchLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
