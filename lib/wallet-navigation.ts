/** Display/navigation helpers only. Payment routing and calculations stay in the pages. */
export type WalletLanguage = 'fr' | 'en' | 'de' | 'lb';

const restaurantContextKeys = [
  'flow', 'restaurant', 'restaurant_account', 'table', 'order_amount', 'order_memo',
  'memo', 'return_url', 'spoke_handle', 'order_id', 'topup_for',
] as const;

export function hasRestaurantContext(search: string): boolean {
  const params = new URLSearchParams(search);
  return restaurantContextKeys.some(key => params.has(key));
}

/** New navigation never discards an existing restaurant handoff. */
export function walletPageHref(path: '/' | '/user', search: string): string {
  return hasRestaurantContext(search) ? `${path}${search.startsWith('?') ? search : `?${search}`}` : path;
}

export function standaloneTopUpHref(search: string): string | null {
  return hasRestaurantContext(search) ? null : '/#top-up';
}

export function readSavedDisplayBalance(storage: Pick<Storage, 'getItem'>, accountName: string): number | null {
  const savedAccount = storage.getItem('innopay_accountName') || storage.getItem('innopayAccountName');
  if (savedAccount !== accountName) return null;
  const raw = storage.getItem('innopay_lastBalance');
  if (raw === null || raw.trim() === '') return null;
  const balance = Number(raw);
  return Number.isFinite(balance) && balance >= 0 ? balance : null;
}

export function initialHubWalletPosition(anchor: { left: number; top: number; width: number }, viewportWidth: number, overlap = false) {
  const walletWidth = 196;
  if (overlap) return {
    x: Math.max(0, viewportWidth - walletWidth),
    y: Math.max(8, anchor.top - 10),
  };
  const side = anchor.left + anchor.width + 16;
  return {
    x: viewportWidth >= 1000 && side + walletWidth <= viewportWidth - 12 ? side : Math.max(8, anchor.left + (anchor.width - walletWidth) / 2),
    y: Math.max(8, anchor.top),
  };
}

/** Farm is browsable while its test-only directory still carries the coming-soon badge. */
export function canBrowsePartner(spoke: { id: string; ready: boolean }): boolean {
  return spoke.ready || spoke.id === 'innohatch';
}

export function partnerLocation(id: string, language: WalletLanguage): string | null {
  if (id !== 'zenbar') return null;
  return { fr: 'Bucarest · Roumanie', en: 'Bucharest · Romania', de: 'Bukarest · Rumänien', lb: 'Bukarest · Rumänien' }[language];
}

export function partnerImage(id: string, registeredImage: string | null): string | null {
  if (registeredImage) return registeredImage;
  if (id === 'innohatch') return '/images/businesses/innopay-farm.jpg';
  if (id === 'zenbar') return '/images/businesses/zenbar-bucharest.jpg';
  return null;
}

export const walletNavigationMessages = {
  fr: { title: 'Bienvenue sur Innopay', home: 'Accueil Innopay', account: 'Mon compte', profile: 'Modifier mon profil', recharge: 'Recharger mon portefeuille', lowBalance: 'Solde faible — pensez à recharger' },
  en: { title: 'Welcome to Innopay', home: 'Innopay home', account: 'My account', profile: 'Edit my profile', recharge: 'Top up my wallet', lowBalance: 'Low balance — remember to top up' },
  de: { title: 'Willkommen bei Innopay', home: 'Innopay Startseite', account: 'Mein Konto', profile: 'Mein Profil bearbeiten', recharge: 'Mein Portemonnaie aufladen', lowBalance: 'Niedriges Guthaben — bitte aufladen' },
  lb: { title: 'Wëllkomm bei Innopay', home: 'Innopay Startsäit', account: 'Mäi Kont', profile: 'Mäi Profil änneren', recharge: 'Mäi Portmonni oplueden', lowBalance: 'Niddrege Solde — denkt drun opzelueden' },
} satisfies Record<WalletLanguage, Record<string, string>>;
