'use client';

import React from 'react';
import Draggable from './Draggable';
import WalletActions from './WalletActions';
import { forgetLocalWallet } from '@/lib/forget-wallet';


export interface WalletBalance {
  accountName: string;
  euroBalance: number;
}

interface MiniWalletProps {
  balance: WalletBalance;
  onClose: () => void;
  visible: boolean;
  language?: string;
  title?: string; // Optional custom title
  initialPosition?: { x: number; y: number }; // Optional custom position
  balanceSource?: string; // 'localStorage-cache' or 'hive-engine' or 'mock-account'
}

/**
 * MiniWallet Component
 *
 * A draggable wallet indicator that displays the user's Innopay account balance.
 * Wraps the Draggable component with wallet-specific styling and functionality.
 *
 * Features:
 * - Draggable positioning with constraints
 * - Shows account name and EURO balance
 * - Collapsible with close button
 * - Persistent position across renders
 *
 * @param balance - The wallet balance object containing accountName and euroBalance
 * @param onClose - Callback function when the close button is clicked
 * @param visible - Controls visibility of the wallet
 * @param title - Optional custom title (defaults to French "Votre portefeuille Innopay")
 * @param initialPosition - Optional custom initial position
 * @param balanceSource - Source of balance data (for styling cached vs fresh)
 */
export default function MiniWallet({
  balance,
  onClose,
  visible,
  title = 'Votre portefeuille Innopay',
  language = 'fr',
  initialPosition,
  balanceSource
}: MiniWalletProps) {

  const handleCloseClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); // Prevent drag from triggering
    onClose();
  };

  // Determine if balance is from cache (stale) or fresh from blockchain
  if (!visible) return null;

  const isCached = balanceSource === 'localStorage-cache';
  const balanceClassName = isCached
    ? 'font-bold text-lg italic text-blue-200' // Cached: italic + light blue
    : 'font-bold text-lg text-white'; // Fresh: normal + white

  // Default position: bottom-right
  const defaultPosition = {
    x: typeof window !== 'undefined' ? window.innerWidth - 316 : 0, // 300px max-width + 16px margin
    y: typeof window !== 'undefined' ? window.innerHeight - 170 : 0  // Approximate height + 30px lift
  };

  return (
    <Draggable keepInViewport bottomInset={40}
      className="z-[9998] innopay-miniwallet bg-gradient-to-r from-blue-600 to-blue-700 text-white "
      initialPosition={initialPosition || defaultPosition}
      style={{
        minWidth: '220px',
        maxWidth: '280px',
      }}
    >
      <div className="mw-header">
        {/* Drag handle indicator */}
        <svg className="mw-grip" aria-hidden="true" width="7" height="16" viewBox="0 0 7 16" fill="currentColor">
            <circle cx="1" cy="4" r="1" /><circle cx="6" cy="4" r="1" />
            <circle cx="1" cy="8" r="1" /><circle cx="6" cy="8" r="1" />
            <circle cx="1" cy="12" r="1" /><circle cx="6" cy="12" r="1" />
          </svg>

        {/* Wallet content */}
        <div className="mw-info">
          <p className="mw-title">{title}</p>
          <div className="mw-balance-row">
            <svg className="mw-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7m17 7h-4v3h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            <div>
              <p className={`mw-amount ${balanceClassName}`}>{balance.euroBalance.toFixed(2)} €</p>
              <a
                href="/user"
                target="_blank"
                rel="noopener noreferrer"
                className="mw-account font-mono hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >{balance.accountName}</a>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleCloseClick}
          onMouseDown={handleCloseClick}
          onTouchStart={handleCloseClick}
          className="mw-close"
          aria-label="Fermer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <WalletActions key={balance.accountName} accountName={balance.accountName} language={language} onForget={() => forgetLocalWallet()} />
    </Draggable>
  );
}

/**
 * ReopenButton Component
 *
 * A fixed button that appears when the wallet is closed, allowing users to reopen it.
 *
 * @param onClick - Callback function when the button is clicked
 * @param visible - Controls visibility of the button (only shown when wallet is closed)
 */
export function WalletReopenButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-[9998] bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
      aria-label="Voir portefeuille"
    >
      <span className="text-2xl">💰</span>
    </button>
  );
}
