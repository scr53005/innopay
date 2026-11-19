// /user/history texts and row labels, fr/en/de/lb (HUB-USER-FEATURES-PLAN §3). Pure.

import type { AccountMovement, MovementKind } from './movement';

export type HistoryLanguage = 'fr' | 'en' | 'de' | 'lb';

interface HistoryTexts {
  entryLink: string;
  title: string;
  all: string;
  rubisOnly: string;
  earned: string;
  spent: string;
  loadedSoFar: string;
  loadMore: string;
  empty: string;
  unavailable: string;
  retry: string;
  backToWallet: string;
  noWallet: string;
  /** Labels per kind. {shop} = shop name, {who} = '@account'. `generic` when no shop is known. */
  kinds: Record<MovementKind, { withShop?: string; generic: string }>;
}

export const historyMessages: Record<HistoryLanguage, HistoryTexts> = {
  fr: {
    entryLink: 'Votre historique Innopay',
    title: 'Historique',
    all: 'Tout',
    rubisOnly: 'RUBIS',
    earned: 'Gagnés',
    spent: 'Dépensés',
    loadedSoFar: 'sur les mouvements affichés',
    loadMore: 'Afficher plus',
    empty: 'Aucun mouvement pour l’instant.',
    unavailable: 'Historique indisponible pour le moment.',
    retry: 'Réessayer',
    backToWallet: 'Retour au portefeuille',
    noWallet: 'Aucun portefeuille Innopay sur cet appareil.',
    kinds: {
      topup: { generic: 'Recharge' },
      change: { generic: 'Monnaie rendue' },
      order: { withShop: 'Commande chez {shop}', generic: 'Paiement d’une commande' },
      rubis_earned: { withShop: 'RUBIS gagnés chez {shop}', generic: 'RUBIS gagnés' },
      rubis_spent: { withShop: 'RUBIS utilisés chez {shop}', generic: 'RUBIS utilisés' },
      photo_reward: { withShop: '{shop} a publié votre photo/vidéo', generic: 'Votre photo/vidéo a été publiée' },
      message: { withShop: 'Message à {shop}', generic: 'Message à un commerce' },
      message_reward: { withShop: '{shop} a aimé votre message', generic: 'Votre message a été apprécié' },
      transfer_in: { withShop: 'Reçu de {shop}', generic: 'Reçu de {who}' },
      transfer_out: { withShop: 'Envoyé à {shop}', generic: 'Envoyé à {who}' },
    },
  },
  en: {
    entryLink: 'Your Innopay history',
    title: 'History',
    all: 'All',
    rubisOnly: 'RUBIS',
    earned: 'Earned',
    spent: 'Spent',
    loadedSoFar: 'over the movements shown',
    loadMore: 'Show more',
    empty: 'No movements yet.',
    unavailable: 'History unavailable right now.',
    retry: 'Try again',
    backToWallet: 'Back to the wallet',
    noWallet: 'No Innopay wallet on this device.',
    kinds: {
      topup: { generic: 'Top-up' },
      change: { generic: 'Change returned' },
      order: { withShop: 'Order at {shop}', generic: 'Order payment' },
      rubis_earned: { withShop: 'RUBIS earned at {shop}', generic: 'RUBIS earned' },
      rubis_spent: { withShop: 'RUBIS used at {shop}', generic: 'RUBIS used' },
      photo_reward: { withShop: '{shop} published your photo/video', generic: 'Your photo/video was published' },
      message: { withShop: 'Message to {shop}', generic: 'Message to a shop' },
      message_reward: { withShop: '{shop} loved your message', generic: 'Your message was appreciated' },
      transfer_in: { withShop: 'Received from {shop}', generic: 'Received from {who}' },
      transfer_out: { withShop: 'Sent to {shop}', generic: 'Sent to {who}' },
    },
  },
  de: {
    entryLink: 'Ihre Innopay-Historie',
    title: 'Verlauf',
    all: 'Alle',
    rubisOnly: 'RUBIS',
    earned: 'Erhalten',
    spent: 'Eingelöst',
    loadedSoFar: 'über die angezeigten Bewegungen',
    loadMore: 'Mehr anzeigen',
    empty: 'Noch keine Bewegungen.',
    unavailable: 'Verlauf derzeit nicht verfügbar.',
    retry: 'Erneut versuchen',
    backToWallet: 'Zurück zum Wallet',
    noWallet: 'Kein Innopay-Wallet auf diesem Gerät.',
    kinds: {
      topup: { generic: 'Aufladung' },
      change: { generic: 'Wechselgeld' },
      order: { withShop: 'Bestellung bei {shop}', generic: 'Bezahlung einer Bestellung' },
      rubis_earned: { withShop: 'RUBIS erhalten bei {shop}', generic: 'RUBIS erhalten' },
      rubis_spent: { withShop: 'RUBIS eingelöst bei {shop}', generic: 'RUBIS eingelöst' },
      photo_reward: { withShop: '{shop} hat Ihr Foto/Video veröffentlicht', generic: 'Ihr Foto/Video wurde veröffentlicht' },
      message: { withShop: 'Nachricht an {shop}', generic: 'Nachricht an ein Geschäft' },
      message_reward: { withShop: '{shop} gefiel Ihre Nachricht', generic: 'Ihre Nachricht kam gut an' },
      transfer_in: { withShop: 'Erhalten von {shop}', generic: 'Erhalten von {who}' },
      transfer_out: { withShop: 'Gesendet an {shop}', generic: 'Gesendet an {who}' },
    },
  },
  lb: {
    entryLink: 'Är Innopay Geschicht',
    title: 'Geschicht',
    all: 'Alles',
    rubisOnly: 'RUBIS',
    earned: 'Kritt',
    spent: 'Ausginn',
    loadedSoFar: 'iwwer déi ugewise Beweegungen',
    loadMore: 'Méi weisen',
    empty: 'Nach keng Beweegungen.',
    unavailable: 'Geschicht momentan net disponibel.',
    retry: 'Nach eng Kéier',
    backToWallet: 'Zréck op de Portemonnaie',
    noWallet: 'Keen Innopay Portemonnaie op dësem Apparat.',
    kinds: {
      topup: { generic: 'Oplueden' },
      change: { generic: 'Wiesselgeld' },
      order: { withShop: 'Bestellung bei {shop}', generic: 'Bezuelung vun enger Bestellung' },
      rubis_earned: { withShop: 'RUBIS kritt bei {shop}', generic: 'RUBIS kritt' },
      rubis_spent: { withShop: 'RUBIS benotzt bei {shop}', generic: 'RUBIS benotzt' },
      photo_reward: { withShop: '{shop} huet Äert Foto/Video publizéiert', generic: 'Äert Foto/Video gouf publizéiert' },
      message: { withShop: 'Message un {shop}', generic: 'Message un e Geschäft' },
      message_reward: { withShop: '{shop} huet Äre Message gär', generic: 'Äre Message gouf geschätzt' },
      transfer_in: { withShop: 'Kritt vun {shop}', generic: 'Kritt vun {who}' },
      transfer_out: { withShop: 'Geschéckt un {shop}', generic: 'Geschéckt un {who}' },
    },
  },
};

export function movementLabel(m: AccountMovement, language: HistoryLanguage): string {
  const texts = historyMessages[language].kinds[m.kind];
  const template = m.shop && texts.withShop ? texts.withShop : texts.generic;
  return template.replace('{shop}', m.shop?.name ?? '').replace('{who}', `@${m.counterparty}`);
}

const UNIT: Record<string, string> = { EURO: '€', LEI: 'lei', RUBIS: '◆' };

/** '+12.50 €', '−3.51 €', '+6 ◆' (RUBIS without trailing zeros). */
export function formatMovementAmount(amount: number, symbol: string): string {
  const sign = amount < 0 ? '−' : '+';
  const abs = Math.abs(amount);
  const value = symbol === 'RUBIS' ? String(Math.round(abs * 100) / 100) : abs.toFixed(2);
  return `${sign}${value} ${UNIT[symbol] ?? symbol}`;
}

/** Local calendar day key 'YYYY-MM-DD', for grouping rows by day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
