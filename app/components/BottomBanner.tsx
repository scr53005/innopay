'use client';

import React from 'react';
import type { WalletLanguage } from '../../lib/wallet-navigation';

// Same contact/legal banner as the spokes, with the hub's four languages.
const translations = {
  fr: { contact: 'Pour toute question ou signalement, veuillez nous écrire à', privacy: 'Politique de confidentialité', terms: 'Conditions générales', expand: 'Appuyez pour plus d’informations', collapse: 'Appuyez pour réduire' },
  en: { contact: 'For any questions or reports, please write to us at', privacy: 'Privacy Policy', terms: 'Terms and Conditions', expand: 'Tap for more information', collapse: 'Tap to collapse' },
  de: { contact: 'Bei Fragen oder Hinweisen schreiben Sie uns an', privacy: 'Datenschutzerklärung', terms: 'Allgemeine Geschäftsbedingungen', expand: 'Für weitere Informationen antippen', collapse: 'Zum Einklappen antippen' },
  lb: { contact: 'Fir all Froen oder Meldungen, schreift eis op', privacy: 'Dateschutzrichtlinn', terms: 'Allgemeng Konditiounen', expand: 'Dréckt fir méi Informatiounen', collapse: 'Dréckt fir ze reduzéieren' },
};

export default function BottomBanner({ language, expanded, onExpandedChange }: {
  language: WalletLanguage;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const t = translations[language];
  return <footer className="hub-bottom-banner" data-expanded={expanded}>
    <button type="button" className="hub-footer-toggle" aria-expanded={expanded} aria-controls="hub-footer-details"
      onClick={() => onExpandedChange(!expanded)}>
      {expanded ? t.collapse : t.expand}<span aria-hidden="true">{expanded ? '▾' : '▴'}</span>
    </button>
    {expanded && <div id="hub-footer-details" className="hub-footer-details">
      <p>{t.contact}<br /><a href="mailto:contact@innopay.lu">contact@innopay.lu</a></p>
      <div className="hub-footer-links">
        <a href="https://www.innopay.lu/privacy-policy" target="_blank" rel="noopener noreferrer">{t.privacy}</a>
        <a href="https://www.innopay.lu/terms-of-service" target="_blank" rel="noopener noreferrer">{t.terms}</a>
      </div>
    </div>}
  </footer>;
}
