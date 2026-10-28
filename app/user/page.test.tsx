// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserPage from './page';

vi.mock('next/image', () => ({ default: ({ fill, priority, objectFit, ...props }: Record<string, unknown>) => <img {...props} /> }));
vi.mock('react-dropzone', () => ({ useDropzone: () => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false }) }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('react-toastify', () => ({ ToastContainer: () => null, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/forget-wallet', () => ({ forgetLocalWallet: vi.fn() }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let requests: { url: string; body: unknown }[];
let pendingBalance: boolean;
let restaurantBalance: number;
let associatedEmail: string | null;
let emailLookupAvailable: boolean;
const response = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/user');
  localStorage.setItem('innopay_accountName', 'alice'); localStorage.setItem('innopay_activePrivate', 'test-active');
  localStorage.setItem('innopay_memoPrivate', 'test-memo'); localStorage.setItem('innopay_lastBalance', '12.50');
  localStorage.setItem('innopay_email', 'alice@example.test'); localStorage.setItem('innopay_language', 'en');
  pendingBalance = false; restaurantBalance = 40; requests = [];
  associatedEmail = 'alice@example.test'; emailLookupAvailable = true;
  vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
    const url = String(input); requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('api.hive-engine.com')) return pendingBalance ? new Promise<Response>(() => {}) : response({ result: [{ balance: '12.50' }] });
    if (url === '/api/fetch-hive-metadata') return response({ metadata: { name: 'Alice', about: '', location: '', website: '', avatarUri: '/alice.png', backgroundUri: '' } });
    if (url.startsWith('/api/account/email?')) return emailLookupAvailable
      ? response({ found: associatedEmail !== null, email: associatedEmail })
      : Promise.resolve({ ok: false } as Response);
    if (url === '/api/suggest-username') return response({ suggestedUsername: 'inno-test' });
    if (url === '/api/campaigns/active') return response({ campaign: null });
    if (url.startsWith('/api/spokes/')) return response({ spoke: { id: 'indies', domain_prod: 'merchant.example', port_dev: 3001, path: '/menu' } });
    if (url.startsWith('/api/balance/euro?')) return response({ balance: restaurantBalance });
    if (url === '/api/execute-order-payment') return response({ redirectUrl: '#mock-merchant' });
    if (url === '/api/checkout/account') return response({ url: '#mock-stripe' });
    throw new Error(`Unexpected request: ${url}`);
  }));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});

describe('existing restaurant checkout continuations', () => {
  const visitOrder = () => window.history.replaceState({}, '', '/user?restaurant=indies&restaurant_account=indies.cafe&table=12&order_amount=25&memo=Item%20A&return_url=http%3A%2F%2Flocalhost%3A3001%2Fmenu%3Ftable%3D12');
  const clickButton = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(element => element.textContent?.trim() === label);
    expect(button).toBeDefined();
    await act(async () => { button!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  it('keeps the sufficient-balance payment payload and optimistic balance update', async () => {
    visitOrder(); await render(); await clickButton('OK');
    expect(requests.find(request => request.url === '/api/execute-order-payment')?.body).toEqual({
      accountName: 'alice', orderAmount: 25, orderMemo: 'Item A', restaurantAccount: 'indies.cafe', table: '12', returnUrl: 'http://localhost:3001/menu?table=12',
    });
    expect(localStorage.getItem('innopay_lastBalance')).toBe('15.00');
    expect(requests.some(request => request.url === '/api/checkout/account')).toBe(false);
  });
  it('keeps the insufficient-balance continuation, rounding and restaurant metadata', async () => {
    restaurantBalance = 4.5;
    visitOrder(); await render(); await clickButton('OK'); await clickButton('Continue');
    expect(requests.find(request => request.url === '/api/checkout/account')?.body).toMatchObject({
      amount: 25, accountName: 'alice', accountBalance: 4.5, email: 'alice@example.test', hasLocalStorageAccount: true,
      restaurantId: 'indies', restaurantAccount: 'indies.cafe', returnUrl: 'http://localhost:3001/menu?table=12',
      redirectParams: { table: '12', orderAmount: '25', orderMemo: 'Item A' },
    });
    expect(requests.some(request => request.url === '/api/execute-order-payment')).toBe(false);
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = () => act(async () => { root.render(<UserPage />); });

describe('existing wallet on /user', () => {
  it('displays the database email when the browser has no cached email', async () => {
    localStorage.removeItem('innopay_email');
    await render();
    expect(requests.some(request => request.url === '/api/account/email?accountName=alice')).toBe(true);
    expect(host.textContent).toContain('alice@example.test');
    const email = [...host.querySelectorAll('p')].find(p => p.textContent === 'alice@example.test');
    expect(email?.textContent).toBe('alice@example.test');
    expect(localStorage.getItem('innopay_email')).toBeNull();
  });
  it('refreshes a stale displayed email without changing checkout’s browser state', async () => {
    localStorage.setItem('innopay_email', 'old@example.test');
    await render();
    expect(host.textContent).toContain('alice@example.test');
    expect(host.textContent).not.toContain('old@example.test');
    expect(localStorage.getItem('innopay_email')).toBe('old@example.test');
  });
  it('retains the cached display when the email endpoint is unavailable', async () => {
    emailLookupAvailable = false;
    await render();
    expect(host.textContent).toContain('alice@example.test');
  });
  it('does not show an old cached association when the database reports none', async () => {
    associatedEmail = null;
    await render();
    expect(host.textContent).not.toContain('alice@example.test');
  });
  it('keeps recharge central, email visible and history below the main actions', async () => {
    await render();
    expect(host.querySelector('.hub-recharge-action')?.textContent).toBe('Top up my wallet');
    expect(host.querySelector('.hub-recharge-action')?.getAttribute('href')).toBe('/#top-up');
    expect(host.querySelector('.hub-history')?.textContent).toContain('coming soon');
    const recharge = host.querySelector('.hub-recharge-action')!;
    expect(recharge.compareDocumentPosition(host.querySelector('.hub-history')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const email = [...host.querySelectorAll('p')].find(p => p.textContent === 'alice@example.test');
    expect(email?.textContent).toBe('alice@example.test');
  });
  it('shows the saved wallet during a pending refresh and while editing the profile', async () => {
    pendingBalance = true;
    await render();
    expect(host.querySelector('.mw-amount')?.textContent).toBe('12.50 €');
    act(() => host.querySelector('.hub-avatar')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector('#name')).not.toBeNull();
    expect(host.querySelector('.mw-amount')?.textContent).toBe('12.50 €');
    expect(host.querySelector('.hub-recharge-action')).not.toBeNull();
    expect(localStorage.getItem('innopay_lastBalance')).toBe('12.50');
  });
  it('leaves the trusted post-payment balance alone', async () => {
    localStorage.setItem('innopay_balance_trustUntil', String(Date.now() + 60_000));
    localStorage.setItem('innopay_lastBalance', '45.75');
    await render();
    expect(host.querySelector('.mw-amount')?.textContent).toBe('45.75 €');
    expect(requests.some(request => request.url.includes('api.hive-engine.com'))).toBe(false);
  });
  it('does not add the standalone recharge route to restaurant handoffs', async () => {
    window.history.replaceState({}, '', '/user?flow=pay_with_topup&restaurant=indies&table=12');
    await render();
    expect(host.querySelector('.hub-recharge-action')).toBeNull();
    expect(requests.some(request => request.url.startsWith('/api/account/email?'))).toBe(false);
    expect(host.textContent).toContain('Continue to payment');
    expect(host.querySelector('.mw-account')?.getAttribute('href')).toBe('/user');
    expect(host.querySelector('.hub-home-link')?.getAttribute('href')).toBe('/?flow=pay_with_topup&restaurant=indies&table=12');
  });
});

it('keeps the no-wallet onboarding page unchanged', async () => {
  localStorage.clear(); await render();
  expect(host.textContent).toContain('Create your Innopay account');
  expect(host.textContent).toContain('Import an account');
  expect(host.querySelector('.hub-header')).toBeNull();
  expect(host.querySelector('.hub-recharge-action')).toBeNull();
  expect(host.querySelector('.hub-bottom-banner')).toBeNull();
  expect(host.querySelector('.innopay-miniwallet')).toBeNull();
});
