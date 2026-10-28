// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletHubHeader from './WalletHubHeader';
import WalletHubFrame from './WalletHubFrame';
import HubMiniWallet from './HubMiniWallet';
import type { WalletLanguage } from '../../lib/wallet-navigation';
vi.mock('@/lib/forget-wallet', () => ({ forgetLocalWallet: vi.fn() }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('compact hub header', () => {
  it('selects a flag and updates the title without navigating away', () => {
    function Header() {
      const [language, setLanguage] = useState<WalletLanguage>('fr');
      return <WalletHubHeader language={language} onLanguageChange={setLanguage} />;
    }
    act(() => root.render(<Header />));
    expect(host.querySelector('[aria-label="Français"]')?.getAttribute('aria-pressed')).toBe('true');
    click(host.querySelector('[aria-label="English"]')!);
    expect(host.querySelector('h1')?.textContent).toBe('Welcome to Innopay');
    expect(host.querySelector('[aria-label="English"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[aria-label="Français"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.hub-avatar')?.getAttribute('href')).toBe('/user');
    expect(host.querySelector('.hub-home-link')?.getAttribute('href')).toBe('/');
  });
  it('preserves the complete restaurant context on new header links', () => {
    const search = '?flow=pay_with_topup&restaurant=indies&table=12&order_memo=hello%20world';
    act(() => root.render(<WalletHubHeader language="en" onLanguageChange={vi.fn()} search={search} />));
    expect(host.querySelector('.hub-avatar')?.getAttribute('href')).toBe(`/user${search}`);
    expect(host.querySelector('.hub-home-link')?.getAttribute('href')).toBe(`/${search}`);
  });
});

describe('MiniWallet and bottom banner share their space', () => {
  it('minimizes and reopens the same wallet above the collapsed and expanded banner', async () => {
    localStorage.setItem('innopay_accountName', 'alice'); localStorage.setItem('innopay_lastBalance', '12.50');
    function Wallet() {
      const [visible, setVisible] = useState(true);
      return <WalletHubFrame language="en"><HubMiniWallet accountName="alice" balance={null} language="en" visible={visible} onVisibilityChange={setVisible} /></WalletHubFrame>;
    }
    await act(async () => root.render(<Wallet />));
    expect(host.querySelector('.mw-amount')?.textContent).toBe('12.50 €');
    click(host.querySelector('.mw-close')!);
    expect(host.querySelector('.innopay-miniwallet')).toBeNull();
    expect((host.querySelector('.innopay-wallet-reopen') as HTMLElement).style.bottom).toContain('42px');
    click(host.querySelector('.hub-footer-toggle')!);
    expect(host.textContent).toContain('Privacy Policy');
    expect((host.querySelector('.innopay-wallet-reopen') as HTMLElement).style.bottom).toContain('212px');
    click(host.querySelector('.innopay-wallet-reopen')!);
    expect(host.querySelector('.mw-amount')?.textContent).toBe('12.50 €');
    expect(host.querySelector('.hub-footer-toggle')?.getAttribute('aria-expanded')).toBe('true');
  });
  it('shows an unresolved balance as pending, without pretending it is zero', async () => {
    await act(async () => root.render(<WalletHubFrame language="fr"><HubMiniWallet accountName="alice" balance={null} language="fr" visible onVisibilityChange={vi.fn()} /></WalletHubFrame>));
    expect(host.querySelector('.mw-amount')?.textContent).toBe('… €');
  });
  it('reopens a dragged home wallet without adding the edge shift again', async () => {
    function Wallet() {
      const [visible, setVisible] = useState(true);
      return <WalletHubFrame language="en"><HubMiniWallet accountName="alice" balance={12} language="en" visible={visible} onVisibilityChange={setVisible} overlap /></WalletHubFrame>;
    }
    await act(async () => root.render(<Wallet />));
    const wallet = host.querySelector('.innopay-miniwallet') as HTMLElement;
    vi.spyOn(wallet, 'getBoundingClientRect').mockReturnValue({ left: 150, top: 120, width: 196, height: 95, right: 346, bottom: 215, x: 150, y: 120, toJSON: () => ({}) });
    click(host.querySelector('.mw-close')!);
    click(host.querySelector('.innopay-wallet-reopen')!);
    const reopened = host.querySelector('.innopay-miniwallet') as HTMLElement;
    const slot = host.querySelector('.hub-wallet-slot') as HTMLElement;
    expect(Number.parseFloat(reopened.style.left) + Number.parseFloat(slot.style.getPropertyValue('--hub-wallet-edge-shift'))).toBe(150);
    expect(reopened.style.top).toBe('120px');
  });
  it.each(['fr', 'en', 'de', 'lb'] as const)('provides contact and legal links in %s', language => {
    act(() => root.render(<WalletHubFrame language={language}><span>Wallet</span></WalletHubFrame>));
    click(host.querySelector('.hub-footer-toggle')!);
    expect(host.querySelector('a[href="mailto:contact@innopay.lu"]')).not.toBeNull();
    expect(host.querySelector('a[href="https://www.innopay.lu/privacy-policy"]')).not.toBeNull();
    expect(host.querySelector('a[href="https://www.innopay.lu/terms-of-service"]')).not.toBeNull();
  });
});
