'use client';

import React, { createContext, useContext, useState } from 'react';
import BottomBanner from './BottomBanner';
import type { WalletLanguage } from '../../lib/wallet-navigation';

const FooterHeightContext = createContext(30);
export const useHubFooterHeight = () => useContext(FooterHeightContext);

export default function WalletHubFrame({ children, language, enabled = true, className = '' }: {
  children: React.ReactNode;
  language: WalletLanguage;
  enabled?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const height = expanded ? 200 : 30;
  if (!enabled) return <div className={className}>{children}</div>;
  return <FooterHeightContext.Provider value={height}>
    <div className={`wallet-hub-page ${className}`} style={{ '--hub-footer-height': `${height}px` } as React.CSSProperties}>
      {children}
      <BottomBanner language={language} expanded={expanded} onExpandedChange={setExpanded} />
    </div>
  </FooterHeightContext.Provider>;
}
