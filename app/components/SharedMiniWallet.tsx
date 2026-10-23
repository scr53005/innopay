'use client';

import React from 'react';
import { MiniWallet as Wallet, type PulseState } from '@innopay/ui';
import { forgetLocalWallet } from '@/lib/forget-wallet';

export { WalletReopenButton } from '@innopay/ui';
export type { PulseState } from '@innopay/ui';
export interface WalletBalance { accountName: string; euroBalance: number }
interface Props {
  balance: WalletBalance;
  onClose: () => void;
  visible: boolean;
  language?: string;
  title?: string;
  initialPosition?: { x: number; y: number };
  balanceSource?: string;
  pulseState?: PulseState;
  onPulseReset?: () => void;
}

/** App adapter: currency, hub navigation and local removal stay here. */
export default function MiniWallet({ balance, balanceSource, ...props }: Props) {
  return <Wallet {...props} accountName={balance.accountName}
    balanceLabel={`${balance.euroBalance.toFixed(2)} €`} accountUrl={'/user'}
    cached={balanceSource === 'localStorage-cache'} onForget={() => forgetLocalWallet()} />;
}
