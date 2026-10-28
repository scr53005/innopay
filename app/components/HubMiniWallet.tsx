'use client';

import React, { useEffect, useRef, useState } from 'react';
import MiniWallet, { WalletReopenButton } from './SharedMiniWallet';
import { useHubFooterHeight } from './WalletHubFrame';
import { initialHubWalletPosition, readSavedDisplayBalance, type WalletLanguage } from '../../lib/wallet-navigation';

/** Positions the branded wallet; never changes the balance used by checkout. */
export default function HubMiniWallet({ accountName, balance, language, visible, onVisibilityChange, balanceSource, search = '', overlap = false }: {
  accountName: string;
  balance: number | null;
  language: WalletLanguage;
  visible: boolean;
  onVisibilityChange: (visible: boolean) => void;
  balanceSource?: string;
  search?: string;
  overlap?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [cached, setCached] = useState<{ accountName: string; balance: number | null } | null>(null);
  const footerHeight = useHubFooterHeight();
  // The shared draggable reserves 8px at either edge. Shift only the home wallet
  // visually, keeping saved drag coordinates in viewport space when reopening.
  const edgeShift = overlap ? 8 : 0;
  useEffect(() => {
    try { setCached({ accountName, balance: readSavedDisplayBalance(localStorage, accountName) }); } catch { /* Storage may be unavailable. */ }
  }, [accountName]);
  useEffect(() => {
    if (anchor.current) setPosition(initialHubWalletPosition(anchor.current.getBoundingClientRect(), document.documentElement.clientWidth || window.innerWidth, overlap));
  }, [overlap]);
  const savedBalance = cached?.accountName === accountName ? cached.balance : null;
  const displayBalance = balance ?? savedBalance;
  const minimize = () => {
    const rect = anchor.current?.querySelector('.innopay-miniwallet')?.getBoundingClientRect();
    if (rect) setPosition({ x: rect.left, y: rect.top });
    onVisibilityChange(false);
  };
  return <div ref={anchor} className={`hub-wallet-slot${overlap ? ' hub-wallet-slot-overlap' : ''}${visible ? '' : ' hub-wallet-slot-minimized'}`}
    style={{ '--hub-wallet-edge-shift': `${edgeShift}px` } as React.CSSProperties}>
    {position && <MiniWallet balance={{ accountName, euroBalance: displayBalance }} language={language}
      visible={visible} onClose={minimize} initialPosition={{ x: position.x - edgeShift, y: position.y }} bottomInset={footerHeight + 12} zIndex={40}
      accountSearch={search} balanceSource={balance === null && savedBalance !== null ? 'localStorage-cache' : balanceSource} />}
    <WalletReopenButton language={language} visible={!visible} onClick={() => onVisibilityChange(true)}
      style={{ bottom: `calc(${footerHeight + 12}px + env(safe-area-inset-bottom, 0px))`, zIndex: 40 }} />
  </div>;
}
