'use client';

import { walletRecoveryMessages } from '@/lib/wallet-recovery-messages';

export default function ForgetWalletButton({ onForget, language = 'en', disabled = false }: {
  onForget: () => void;
  language?: keyof typeof walletRecoveryMessages;
  disabled?: boolean;
}) {
  const t = walletRecoveryMessages[language];
  return <button type="button" disabled={disabled} onClick={() => { if (window.confirm(t.confirm)) onForget(); }}
    className="text-sm font-semibold text-red-700 underline disabled:opacity-50">{t.forget}</button>;
}
