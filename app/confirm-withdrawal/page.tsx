'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type State = 'idle' | 'loading' | 'ok' | 'late_confirmed' | 'expired' | 'notfound' | 'error';

const card: React.CSSProperties = {
  maxWidth: 480,
  margin: '10vh auto',
  padding: '2rem',
  fontFamily: 'Arial, sans-serif',
  color: '#111827',
  background: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  textAlign: 'center',
};

function ConfirmInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>('idle');

  async function confirm() {
    if (!token) {
      setState('error');
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/confirm-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        // A timely confirm re-executes the withdrawal; a click on an already-
        // expired link is recorded as a "late confirm" (no re-broadcast).
        const data = await res.json().catch(() => ({} as { status?: string }));
        setState(data?.status === 'late_confirmed' ? 'late_confirmed' : 'ok');
      } else if (res.status === 410) setState('expired');
      else if (res.status === 404) setState('notfound');
      else setState('error');
    } catch {
      setState('error');
    }
  }

  if (state === 'ok') {
    return (
      <div style={card}>
        <h2>Withdrawal confirmed ✅</h2>
        <p>Thanks — your withdrawal will be processed. The funds settle after Hive&apos;s standard 3-day savings delay.</p>
      </div>
    );
  }
  if (state === 'late_confirmed') {
    return (
      <div style={card}>
        <h2>Thanks — noted it was you ✅</h2>
        <p>This withdrawal had already expired, so it stays cancelled and your money is safe. We&apos;ve recorded that it was you. If you still want the funds, please request the withdrawal again.</p>
      </div>
    );
  }
  if (state === 'expired') {
    return (
      <div style={card}>
        <h2>Link expired</h2>
        <p>This confirmation link has expired, so the withdrawal stays cancelled and your money is safe. If you still want to withdraw, please request it again.</p>
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <div style={card}>
        <h2>Nothing to confirm</h2>
        <p>This link isn&apos;t valid (it may have already been handled). If you have questions, contact <a href="mailto:contact@innopay.lu">contact@innopay.lu</a>.</p>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={card}>
        <h2>Something went wrong</h2>
        <p>We couldn&apos;t process this confirmation. Please try again in a moment, or contact <a href="mailto:contact@innopay.lu">contact@innopay.lu</a>.</p>
        <button onClick={() => setState('idle')} style={{ marginTop: 16 }}>Try again</button>
      </div>
    );
  }

  return (
    <div style={card}>
      <h2>Confirm your withdrawal</h2>
      <p>A withdrawal from your Innopay savings was requested and, as a precaution, temporarily stopped.</p>
      <p><strong>If this was you</strong>, confirm below to let it proceed.</p>
      <p style={{ color: '#4b5563' }}>If this wasn&apos;t you, just close this page — your money is safe and the withdrawal stays cancelled.</p>
      <button
        onClick={confirm}
        disabled={state === 'loading' || !token}
        style={{
          marginTop: 16,
          background: '#16a34a',
          color: '#fff',
          border: 'none',
          padding: '12px 20px',
          borderRadius: 8,
          fontWeight: 'bold',
          cursor: state === 'loading' ? 'default' : 'pointer',
          opacity: state === 'loading' || !token ? 0.6 : 1,
        }}
      >
        {state === 'loading' ? 'Confirming…' : 'Yes, this was me — confirm'}
      </button>
      {!token && <p style={{ color: '#b91c1c', marginTop: 12 }}>This link is missing its token.</p>}
    </div>
  );
}

export default function ConfirmWithdrawalPage() {
  return (
    <Suspense fallback={<div style={card}>Loading…</div>}>
      <ConfirmInner />
    </Suspense>
  );
}
