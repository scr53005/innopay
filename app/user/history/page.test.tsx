// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryPage from './page';
import { verifyAccountProof } from '@/lib/account-proof';

const key = PrivateKey.fromLogin('alice', 'test-only-password', 'active');
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let bodies: Record<string, unknown>[];

const movement = (m: Record<string, unknown>) => ({
  account: 'alice', at: '2026-11-19T10:00:00Z', symbol: 'EURO', counterparty: 'innopay', source: 'hive-engine', tx_id: 'tx', ...m,
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  localStorage.setItem('innopay_accountName', 'alice');
  localStorage.setItem('innopay_activePrivate', key.toString());
  localStorage.setItem('innopay_language', 'en');
  bodies = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/history') throw new Error(`Unexpected request: ${url}`);
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const movements = body.filter === 'RUBIS'
      ? [movement({ kind: 'rubis_earned', symbol: 'RUBIS', amount: 2, shop: { name: 'Indies' }, tx_id: 'r1' }),
        movement({ kind: 'rubis_spent', symbol: 'RUBIS', amount: -0.5, shop: { name: 'Indies' }, tx_id: 'r2' })]
      : [movement({ kind: 'order', amount: -3.51, shop: { id: 'indies', name: 'Indies' }, tx_id: 'o1' }),
        movement({ kind: 'topup', amount: 20, tx_id: 't1' })];
    return { ok: true, json: async () => ({ movements, nextOffset: null }) } as Response;
  }));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const render = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><HistoryPage /></QueryClientProvider>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

it('signs each page with the wallet’s active key and lists labelled rows', async () => {
  await render();
  const rows = [...host.querySelectorAll('.hub-history-row')].map((r) => r.textContent);
  expect(rows[0]).toContain('Order at Indies');
  expect(rows[0]).toContain('−3.51 €');
  expect(rows[1]).toContain('Top-up');
  expect(rows[1]).toContain('+20.00 €');
  const b = bodies[0] as { ts: number; nonce: string; signature: string; offset: number };
  expect(b.offset).toBe(0);
  expect(verifyAccountProof({ purpose: 'history', account: 'alice', payload: '', ts: b.ts, nonce: b.nonce }, b.signature,
    [key.createPublic().toString()])).toBe(true);
});

it('the RUBIS view shows earned vs spent', async () => {
  await render();
  const rubisButton = [...host.querySelectorAll('.hub-history-filter button')].find((b) => b.textContent === 'RUBIS')!;
  await act(async () => { rubisButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(bodies[bodies.length - 1]).toMatchObject({ filter: 'RUBIS' });
  const totals = host.querySelector('.hub-history-rubis-totals')?.textContent;
  expect(totals).toContain('Earned +2 ◆');
  expect(totals).toContain('Spent −0.5 ◆');
});

it('without a wallet on the device, asks nothing from the server', async () => {
  localStorage.removeItem('innopay_activePrivate');
  await render();
  expect(host.textContent).toContain('No Innopay wallet on this device.');
  expect(bodies).toHaveLength(0);
});
