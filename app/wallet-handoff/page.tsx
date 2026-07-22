'use client';

// Secure wallet hand-off landing (hub side). The spoke navigated here with a
// signed, single-use challenge. We verify it (server action → active-key proof +
// freshness + replay + on-chain check), import active+memo into the HUB's
// localStorage (never the master password), reconcile any existing account
// (switch-to-current + notice), then continue into the Flow-7 top-up checkout.
//
// useSearchParams requires a Suspense boundary (innopay CLAUDE.md convention).

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyWalletHandoff } from '@/app/actions/verify-handoff';
import { getCurrencyConfig } from '@/lib/currency-config';

// Suggested top-up: cover the deficit, round UP to the currency's increment, floor
// at its minimum (EUR 5/15, RON 30/90 — matches the hub's existing Flow-7 sizing).
function computeTopup(orderAmount: number, balance: number, fiat: string | null): number {
  const cfg = getCurrencyConfig(fiat ?? undefined);
  const deficit = Math.max(0, orderAmount - balance);
  return Math.max(Math.ceil(Math.ceil(deficit) / cfg.roundIncrement) * cfg.roundIncrement, cfg.minTopup);
}

// Fetch the account's live EURO balance from Hive-Engine — used when the spoke
// didn't pass a `balance` (so spokes needn't thread it through their state machine).
async function fetchEuroBalance(account: string): Promise<number> {
  try {
    const r = await fetch('https://api.hive-engine.com/rpc/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'find',
        params: { contract: 'tokens', table: 'balances', query: { account, symbol: 'EURO' }, limit: 1 },
        id: 1,
      }),
    });
    const d = await r.json();
    return d.result?.[0] ? parseFloat(d.result[0].balance) : 0;
  } catch {
    return 0;
  }
}

function HandoffInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState('Vérification de votre portefeuille…');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false); // guard against StrictMode double-run (nonce is single-use!)

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const account = params.get('handoff_account');
      const ts = Number(params.get('handoff_ts'));
      const nonce = params.get('handoff_nonce');
      const sig = params.get('handoff_sig');
      if (!account || !ts || !nonce || !sig) {
        setError('Lien de portefeuille invalide.');
        return;
      }

      // 1. Verify + fetch active+memo (secure server action).
      const res = await verifyWalletHandoff({ account, ts, nonce, sig });
      if (!res.success || !res.activeKey || !res.accountName) {
        setError(res.error || 'La vérification du portefeuille a échoué.');
        return;
      }

      // 2. Reconcile + import into the HUB's localStorage. Switch-to-current: a
      //    different existing account is replaced (it stays re-importable via Flow 8).
      const prev = localStorage.getItem('innopay_accountName');
      if (prev && prev !== res.accountName) {
        setNotice(`Vous utilisez maintenant @${res.accountName} (auparavant @${prev}).`);
      }
      localStorage.setItem('innopay_accountName', res.accountName);
      localStorage.setItem('innopay_activePrivate', res.activeKey);
      localStorage.setItem('innopay_memoPrivate', res.memoKey || '');
      // Minimization: never keep the master password; drop any left from a prior account.
      localStorage.removeItem('innopay_masterPassword');

      // Balance: use what the spoke passed, else fetch it fresh (now that we hold
      // the account). Small staleness is harmless — the top-up rounds up to 5€/min 15€.
      const balanceStr = params.get('balance');
      const balance = balanceStr ? parseFloat(balanceStr) : await fetchEuroBalance(res.accountName);

      // 3. Continue: if there's order context, go to the Flow-7 top-up checkout.
      const orderAmountStr = params.get('order_amount');
      const restaurantAccount = params.get('restaurant_account');
      const restaurant = params.get('restaurant');
      const returnUrl = params.get('return_url') || undefined;
      const table = params.get('table') || undefined;
      const orderMemo = params.get('order_memo') || undefined;

      if (orderAmountStr && restaurantAccount) {
        setStatus('Redirection vers le rechargement…');
        const orderAmount = parseFloat(orderAmountStr);
        const topup = computeTopup(orderAmount, balance, params.get('fiat'));
        // Seed the OPTIMISTIC post-transaction balance (current + top-up − order) so
        // the hub shows the right number immediately when the customer comes back —
        // on-chain indexing lags a few seconds. (No long trust window: on abandon the
        // live fetch self-corrects quickly.)
        const optimistic = Math.max(0, balance + topup - orderAmount);
        localStorage.setItem('innopay_lastBalance', optimistic.toFixed(2));
        localStorage.setItem('innopay_lastBalance_timestamp', Date.now().toString());
        try {
          const checkoutRes = await fetch('/api/checkout/account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: topup,
              accountName: res.accountName,
              returnUrl,
              redirectParams: { table, orderAmount: orderAmount.toString(), orderMemo },
              hasLocalStorageAccount: true,
              accountBalance: balance,
              restaurantId: restaurant,
              restaurantAccount,
            }),
          });
          const d = await checkoutRes.json();
          if (d.url) {
            window.location.href = d.url;
            return;
          }
          setError('Impossible de créer le paiement.');
        } catch {
          setError('Erreur réseau lors de la création du paiement.');
        }
      } else {
        // Pure wallet sync (no order): seed the current balance and land on the wallet.
        localStorage.setItem('innopay_lastBalance', balance.toFixed(2));
        localStorage.setItem('innopay_lastBalance_timestamp', Date.now().toString());
        setStatus('Portefeuille importé ✓');
        setTimeout(() => (window.location.href = '/user'), 800);
      }
    })();
  }, [params]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-6 text-center">
      {error ? (
        <>
          <div className="text-lg font-bold text-red-600">{error}</div>
          <a href="/user" className="mt-4 text-sm text-blue-600 underline">Aller à mon compte</a>
        </>
      ) : (
        <>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <div className="mt-4 text-sm text-stone-600">{status}</div>
          {notice && <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{notice}</div>}
        </>
      )}
    </main>
  );
}

export default function WalletHandoffPage() {
  return (
    <Suspense>
      <HandoffInner />
    </Suspense>
  );
}
