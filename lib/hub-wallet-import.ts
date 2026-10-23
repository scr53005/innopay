import { clearWalletContext, parseWalletImport, walletImportAction, type WalletImportChoice } from './wallet-import';

/** The hub's legacy wallet features also consume the verified master/posting credentials. */
export function parseHubWalletImport(data: unknown) {
  const wallet = parseWalletImport(data);
  const verified = data as { masterPassword?: unknown; seed?: unknown; keys?: { posting?: unknown } };
  return {
    ...wallet,
    masterPassword: typeof verified.masterPassword === 'string' ? verified.masterPassword : undefined,
    seed: typeof verified.seed === 'string' ? verified.seed : undefined,
    keys: { ...wallet.keys, posting: typeof verified.keys?.posting === 'string' ? verified.keys.posting : undefined },
  };
}

export type HubWalletImport = ReturnType<typeof parseHubWalletImport>;

/** Save only after a verified import and an explicit choice when accounts differ. */
export function saveHubWalletImport(storage: Storage, data: unknown, email: string | null, choice?: WalletImportChoice) {
  const wallet = parseHubWalletImport(data);
  const current = storage.getItem('innopay_accountName') || storage.getItem('innopayAccountName');
  const action = walletImportAction(current, wallet.accountName, choice);
  if (action !== 'import') return action;

  clearWalletContext(storage);
  for (const key of [
    'innopayAccountName', 'innopayMasterPassword', 'innopaySeed',
    'innopay_masterPassword', 'innopay_seed', 'innopay_postingPrivate',
    'innopay_postingPublic', 'innopay_activePublic', 'innopay_memoPublic',
    'innopay_ownerPrivate', 'innopay_ownerPublic',
  ]) storage.removeItem(key);
  storage.setItem('innopay_activePrivate', wallet.keys.active);
  storage.setItem('innopay_memoPrivate', wallet.keys.memo);
  if (wallet.masterPassword) storage.setItem('innopay_masterPassword', wallet.masterPassword);
  if (wallet.seed) storage.setItem('innopay_seed', wallet.seed);
  if (wallet.keys.posting) storage.setItem('innopay_postingPrivate', wallet.keys.posting);
  storage.setItem('innopay_accountName', wallet.accountName);
  if (email?.trim()) storage.setItem('innopay_email', email.trim().toLowerCase());
  else storage.removeItem('innopay_email'); // Manual keys do not establish an email association.
  return action;
}
