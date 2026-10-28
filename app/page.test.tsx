// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './page';

const state = vi.hoisted(() => ({ params: new URLSearchParams(), balance: 0, refetch: vi.fn(), router: { push: vi.fn() }, handoff: vi.fn(async () => '#mock-partner') }));
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params, useRouter: () => state.router }));
vi.mock('@/hooks/useBalance', () => ({ useBalance: () => ({ balance: state.balance, isLoading: false, refetch: state.refetch, source: 'hive-engine' }) }));
vi.mock('@/app/actions/get-credentials', () => ({ getAccountCredentials: vi.fn() }));
vi.mock('next/image', () => ({ default: ({ fill, priority, unoptimized, ...props }: Record<string, unknown>) => <img {...props} /> }));
vi.mock('@/lib/forget-wallet', () => ({ forgetLocalWallet: vi.fn() }));
vi.mock('@/lib/credential-session', () => ({ prepareUrlWithCredentials: state.handoff }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let requests: { url: string; body: unknown }[];
let directory: Record<string, unknown>[];
const response = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body } as Response);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); window.history.replaceState({}, '', '/');
  localStorage.setItem('innopay_accountName', 'alice'); localStorage.setItem('innopay_activePrivate', 'test-active');
  localStorage.setItem('innopay_memoPrivate', 'test-memo'); localStorage.setItem('innopay_masterPassword', 'test-master');
  state.params = new URLSearchParams(); state.balance = 0; requests = [];
  state.handoff.mockClear();
  directory = ['Millewee', 'Indies', 'Zenbar'].map((name, i) => ({ id: String(i), name, ready: true, image_1: null }));
  vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
    const url = String(input); requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/spokes') return response({ spokes: directory });
    if (url === '/api/fetch-hive-metadata') return response({ metadata: { avatarUri: '/alice.png' } });
    if (url.startsWith('/api/account/email?')) return response({ found: true, email: 'alice@example.test' });
    if (url === '/api/checkout/account') return response({ error: 'Checkout stopped by test before Stripe' }, false);
    throw new Error(`Unexpected request: ${url}`);
  }));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = () => act(async () => { root.render(<LandingPage />); });

describe('wallet home', () => {
  it.each([
    { language: 'Français', menu: 'Voir le menu', opening: 'Ouverture prochaine', badge: 'Bientôt' },
    { language: 'English', menu: 'View menu', opening: 'Opening soon', badge: 'Coming soon' },
    { language: 'Deutsch', menu: 'Speisekarte ansehen', opening: 'Eröffnung demnächst', badge: 'Demnächst' },
    { language: 'Lëtzebuergesch', menu: 'Menü kucken', opening: 'Mécht geschwënn op', badge: 'Geschwënn' },
  ])('translates shop actions, availability badges and alerts into $language', async ({ language, menu, opening, badge }) => {
    directory = [
      { id: 'millewee', name: 'Millewee', ready: true, image_1: null },
      { id: 'al21', name: 'AL21', ready: false, image_1: null },
    ];
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await render();
    act(() => host.querySelector(`button[aria-label="${language}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const [live, upcoming] = host.querySelectorAll('.hub-shop-card');
    expect(live.textContent).toContain(menu);
    expect(upcoming.textContent).toContain(opening);
    expect(upcoming.textContent).toContain(badge);
    await act(async () => { upcoming.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(alert).toHaveBeenCalledWith(`AL21 — ${opening}`);
    expect(state.handoff).not.toHaveBeenCalled();
  });
  it('keeps Farm marked coming soon while opening the directory root with the existing handoff', async () => {
    directory = [{ id: 'innohatch', name: 'Innopay Farm', ready: false, image_1: null, domain_prod: 'pay.innopay.lu', port_dev: 3004, path: '/mcc' }];
    await render();
    const farm = host.querySelector('.hub-shop-card')!;
    expect(farm.textContent).toContain('Bientôt');
    expect(farm.querySelector('img')?.getAttribute('src')).toBe('/images/businesses/innopay-farm.jpg');
    await act(async () => { farm.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(state.handoff).toHaveBeenCalledWith('http://localhost:3004/', '4');
    expect(directory[0].path).toBe('/mcc');
  });
  it('shows live Zenbar’s photo and city without a coming-soon badge', async () => {
    directory = [{ id: 'zenbar', name: 'Zen Bar', ready: true, image_1: null }];
    await render();
    const zenbar = host.querySelector('.hub-shop-card')!;
    expect(zenbar.textContent).toContain('Bucarest · Roumanie');
    expect(zenbar.textContent).not.toContain('Bientôt');
    expect(zenbar.querySelector('img')?.getAttribute('src')).toBe('/images/businesses/zenbar-bucharest.jpg');
    expect(host.querySelector('#hub-shops-heading')?.textContent).toBe('Commerces acceptant Innopay');
  });
  it('keeps discovery and the branded wallet available at zero balance', async () => {
    await render();
    expect(host.querySelectorAll('.hub-shop-card')).toHaveLength(3);
    expect(host.querySelector('.hub-shop-window-low')).not.toBeNull();
    expect(host.textContent).toContain('Solde faible — pensez à recharger');
    expect(host.querySelector('.mw-amount')?.textContent).toBe('0.00 €');
    expect(host.querySelector('.hub-avatar img')?.getAttribute('src')).toBe('/alice.png');
    expect(host.querySelector('#top-up')).not.toBeNull();
  });
  it('places the scanner below the flags and above shop discovery, outside the top-up form', async () => {
    await render();
    const scanner = host.querySelector('.hub-scanner-row')!;
    expect(scanner).not.toBeNull();
    expect(host.querySelector('.hub-languages')!.compareDocumentPosition(scanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scanner.compareDocumentPosition(host.querySelector('#hub-shops-heading')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scanner.compareDocumentPosition(host.querySelector('#top-up')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scanner.closest('form')).toBeNull();
    const entry = scanner.querySelector('a')!;
    expect(entry.getAttribute('href')).toBe('/scan');
    expect(entry.getAttribute('target')).toBe('_blank');
    expect(entry.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('keeps the wallet minimized when a refreshed balance arrives', async () => {
    await render();
    act(() => host.querySelector('.mw-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    state.balance = 17.25; await render();
    expect(host.querySelector('.innopay-miniwallet')).toBeNull();
    expect(host.querySelector('.innopay-wallet-reopen')).not.toBeNull();
    expect(host.querySelector('.hub-shop-window-low')).toBeNull();
    act(() => host.querySelector('.innopay-wallet-reopen')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector('.mw-amount')?.textContent).toBe('17.25 €');
  });
  it('preserves the standalone top-up payload and email prefill', async () => {
    await render();
    await act(async () => { host.querySelector('#top-up')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(requests.find(request => request.url === '/api/checkout/account')?.body).toMatchObject({
      amount: 100, accountName: 'alice', email: 'alice@example.test', hasLocalStorageAccount: true, accountBalance: 0, redirectParams: null,
    });
  });
  it('preserves Flow 7 order details, table and return URL at the checkout boundary', async () => {
    state.balance = 4;
    state.params = new URLSearchParams({ topup_for: 'order', source: 'indiesmenu', account: 'alice', balance: '4', deficit: '7.5', table: '12', order_amount: '11.50', order_memo: 'Order at table 12', return_url: 'http://localhost:3001/menu?table=12' });
    await render();
    expect(host.querySelector('.hub-shops')).toBeNull();
    expect(host.querySelector('.hub-scanner-row')).toBeNull();
    expect(requests.some(request => request.url === '/api/fetch-hive-metadata')).toBe(false);
    await act(async () => { host.querySelector('#top-up')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(requests.find(request => request.url === '/api/checkout/account')?.body).toMatchObject({
      accountName: 'alice', accountBalance: 4, hasLocalStorageAccount: true,
      redirectParams: { table: '12', orderAmount: '11.50', orderMemo: 'Order at table 12' },
      returnUrl: 'http://localhost:3001/menu?table=12',
    });
  });
});
