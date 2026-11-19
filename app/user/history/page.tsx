'use client';

// /user/history — the customer's account history (HUB-USER-FEATURES-PLAN §3).
// Each page is fetched with a fresh account proof signed by the wallet on this device (no
// prompt: the key is already here). Without a wallet there is nothing to show.

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { newAccountProofNonce, signAccountProof } from '@/lib/account-proof';
import { rubisTotals } from '@/lib/history/classify';
import type { HistoryFilter, HistoryPage } from '@/lib/history/load';
import type { AccountMovement } from '@/lib/history/movement';
import { dayKey, formatMovementAmount, historyMessages, movementLabel, type HistoryLanguage } from '@/lib/history/messages';

const KIND_ICON: Record<AccountMovement['kind'], string> = {
  topup: '💳', change: '↩️', order: '🍽️', rubis_earned: '◆', rubis_spent: '◆',
  photo_reward: '🎉', message: '✉️', message_reward: '🎉', transfer_in: '⬇️', transfer_out: '⬆️',
};

async function fetchHistoryPage(account: string, activeKey: string, offset: number, filter: HistoryFilter): Promise<HistoryPage> {
  const fields = { purpose: 'history' as const, account, payload: '', ts: Date.now(), nonce: newAccountProofNonce() };
  const signature = signAccountProof(fields, activeKey);
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, ts: fields.ts, nonce: fields.nonce, signature, offset, filter }),
  });
  if (!response.ok) throw new Error(`history ${response.status}`);
  return response.json();
}

export default function HistoryPage() {
  const [ready, setReady] = useState(false);
  const [language, setLanguage] = useState<HistoryLanguage>('fr');
  const [account, setAccount] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');

  useEffect(() => {
    try {
      const lang = localStorage.getItem('innopay_language');
      if (lang === 'en' || lang === 'fr' || lang === 'de' || lang === 'lb') setLanguage(lang);
      setAccount(localStorage.getItem('innopay_accountName') || localStorage.getItem('innopayAccountName') || '');
      setActiveKey(localStorage.getItem('innopay_activePrivate') || '');
    } catch { /* no storage: treated as no wallet */ }
    setReady(true);
  }, []);

  const t = historyMessages[language];
  const hasWallet = !!account && !!activeKey;

  const query = useInfiniteQuery({
    queryKey: ['account-history', account, filter],
    queryFn: ({ pageParam }) => fetchHistoryPage(account, activeKey, pageParam, filter),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: hasWallet,
    staleTime: 60_000,
    retry: 1,
  });

  const movements = useMemo(() => query.data?.pages.flatMap((p) => p.movements) ?? [], [query.data]);
  const days = useMemo(() => {
    const groups: { day: string; rows: AccountMovement[] }[] = [];
    for (const m of movements) {
      const day = dayKey(m.at);
      if (groups[groups.length - 1]?.day !== day) groups.push({ day, rows: [] });
      groups[groups.length - 1].rows.push(m);
    }
    return groups;
  }, [movements]);
  const totals = useMemo(() => rubisTotals(movements), [movements]);
  const locale = language === 'lb' ? 'lb-LU' : language;

  return (
    <main className="min-h-screen flex items-start justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-blue-900">{t.title}</h1>
          {hasWallet && (
            <div className="hub-history-filter flex rounded-lg bg-gray-100 p-0.5 text-sm">
              {(['all', 'RUBIS'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`px-3 py-1 rounded-md ${filter === f ? 'bg-white shadow text-blue-900 font-semibold' : 'text-gray-600'}`}>
                  {f === 'all' ? t.all : t.rubisOnly}
                </button>
              ))}
            </div>
          )}
        </div>

        {ready && !hasWallet && <p className="text-gray-700">{t.noWallet}</p>}

        {hasWallet && filter === 'RUBIS' && query.isSuccess && (
          <div className="hub-history-rubis-totals flex items-baseline justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm">
            <span>{t.earned} <strong className="text-emerald-700">{formatMovementAmount(totals.earned, 'RUBIS')}</strong></span>
            <span>{t.spent} <strong className="text-rose-700">{formatMovementAmount(-totals.spent, 'RUBIS')}</strong></span>
            {query.hasNextPage && <span className="text-xs text-gray-500">{t.loadedSoFar}</span>}
          </div>
        )}

        {hasWallet && query.isPending && <p className="text-gray-500">…</p>}

        {hasWallet && query.isError && movements.length === 0 && (
          <p className="text-sm text-red-600">
            {t.unavailable}{' '}
            <button type="button" className="underline" onClick={() => query.refetch()}>{t.retry}</button>
          </p>
        )}

        {query.isSuccess && movements.length === 0 && !query.hasNextPage && <p className="text-gray-500">{t.empty}</p>}

        {days.map(({ day, rows }) => (
          <section key={day}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              {new Date(rows[0].at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </h2>
            <ul className="divide-y divide-gray-100">
              {rows.map((m) => (
                <li key={`${m.tx_id}:${m.symbol}:${m.amount}`} className="hub-history-row flex items-center gap-2 py-1.5 text-sm">
                  <span aria-hidden className="w-5 text-center">{KIND_ICON[m.kind]}</span>
                  <span className="flex-1 truncate text-gray-800">{movementLabel(m, language)}</span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {new Date(m.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`w-24 text-right font-semibold tabular-nums ${m.amount > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                    {formatMovementAmount(m.amount, m.symbol)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {query.hasNextPage && (
          <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}
            className="w-full rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm py-2">
            {query.isFetchingNextPage ? '…' : t.loadMore}
          </button>
        )}
        {query.isError && movements.length > 0 && <p className="text-sm text-red-600">{t.unavailable}</p>}

        <a href="/user" className="block text-center text-sm text-gray-600 underline">{t.backToWallet}</a>
      </div>
    </main>
  );
}
