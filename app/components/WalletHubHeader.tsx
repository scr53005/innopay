'use client';

import React from 'react';
import { walletNavigationMessages, walletPageHref, type WalletLanguage } from '../../lib/wallet-navigation';

const languages: { code: WalletLanguage; name: string }[] = [
  { code: 'fr', name: 'Français' }, { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' }, { code: 'lb', name: 'Lëtzebuergesch' },
];

function Flag({ language }: { language: WalletLanguage }) {
  if (language === 'en') return <svg viewBox="0 0 60 40" aria-hidden="true">
    <rect width="60" height="40" fill="#012169" />
    <path d="M0 0L60 40M60 0L0 40" stroke="white" strokeWidth="9" />
    <path d="M0 0L60 40M60 0L0 40" stroke="#c8102e" strokeWidth="3" />
    <path d="M30 0V40M0 20H60" stroke="white" strokeWidth="14" />
    <path d="M30 0V40M0 20H60" stroke="#c8102e" strokeWidth="8" />
  </svg>;
  if (language === 'fr') return <svg viewBox="0 0 60 40" aria-hidden="true"><path fill="#002395" d="M0 0h20v40H0z" /><path fill="white" d="M20 0h20v40H20z" /><path fill="#ed2939" d="M40 0h20v40H40z" /></svg>;
  const colors = language === 'de' ? ['#111111', '#dd0000', '#ffce00'] : ['#ed2939', '#ffffff', '#00a1de'];
  return <svg viewBox="0 0 60 40" aria-hidden="true">{colors.map((color, index) => <rect key={color} x="0" y={index * 40 / 3} width="60" height={40 / 3 + 0.1} fill={color} />)}</svg>;
}

export default function WalletHubHeader({ language, onLanguageChange, avatarUrl, onAvatarClick, search = '' }: {
  language: WalletLanguage;
  onLanguageChange: (language: WalletLanguage) => void;
  avatarUrl?: string;
  onAvatarClick?: () => void;
  search?: string;
}) {
  const t = walletNavigationMessages[language];
  const avatar = <img src={avatarUrl || '/images/Koala-BlueBg.png'} alt="" width="40" height="40"
    onError={event => { if (!event.currentTarget.src.endsWith('/images/Koala-BlueBg.png')) event.currentTarget.src = '/images/Koala-BlueBg.png'; }} />;
  return <header className="hub-header">
    <div className="hub-header-row">
      <a className="hub-home-link" href={walletPageHref('/', search)} aria-label={t.home}>
        <img src="/innopay-compact.svg" alt="Innopay" width="40" height="40" />
      </a>
      <h1>{t.title}</h1>
      {onAvatarClick ? <button type="button" className="hub-avatar" onClick={onAvatarClick} aria-label={t.profile}>{avatar}</button>
        : <a className="hub-avatar" href={walletPageHref('/user', search)} aria-label={t.account}>{avatar}</a>}
    </div>
    <div className="hub-languages" role="group" aria-label="Language / Langue">
      {languages.map(lang => <button key={lang.code} type="button" className="hub-flag" lang={lang.code}
        aria-label={lang.name} aria-pressed={language === lang.code} onClick={() => onLanguageChange(lang.code)}>
        <Flag language={lang.code} />
      </button>)}
    </div>
  </header>;
}
