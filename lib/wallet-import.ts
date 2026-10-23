/** Verified imports stay in memory until the user chooses which wallet to keep. */
export interface WalletImport {
  accountName: string;
  keys: { active: string; memo: string };
}

export type WalletImportChoice = 'replace' | 'keep';
export type WalletImportAction = 'import' | 'confirm' | 'keep';

export function vendorImportAccounts<T extends { accountName: string }>(accounts: T[], requiredAccountName?: string): T[] {
  if (!requiredAccountName) return accounts;
  const matches = accounts.filter(account => account.accountName === requiredAccountName);
  if (matches.length === 0) {
    throw new Error(`This email does not provide @${requiredAccountName}. Import the wallet for this vendor.`);
  }
  return matches;
}

export function parseWalletImport(data: unknown, requiredAccountName?: string): WalletImport {
  const candidate = data as Partial<WalletImport> | null;
  if (!candidate || typeof candidate.accountName !== 'string' || !candidate.accountName.trim()) {
    throw new Error('The verified account could not be imported. Please try again.');
  }
  if (requiredAccountName && candidate.accountName !== requiredAccountName) {
    throw new Error(`This email does not provide @${requiredAccountName}. Import the wallet for this vendor.`);
  }
  if (typeof candidate.keys?.active !== 'string' || !candidate.keys.active.trim() ||
      typeof candidate.keys?.memo !== 'string' || !candidate.keys.memo.trim()) {
    throw new Error('The verified account is missing its wallet keys. Your existing wallet has been kept.');
  }
  // Drop master/posting keys returned by legacy APIs before keeping a pending import.
  return { accountName: candidate.accountName, keys: { active: candidate.keys.active, memo: candidate.keys.memo } };
}

export function walletImportAction(
  currentAccount: string | null,
  incomingAccount: string,
  choice?: WalletImportChoice,
): WalletImportAction {
  if (choice === 'keep') return 'keep';
  return currentAccount && currentAccount !== incomingAccount && choice !== 'replace' ? 'confirm' : 'import';
}

/** Shared caches describe the active wallet; they cannot follow it to another account. */
export function clearWalletContext(storage: Pick<Storage, 'removeItem'>): void {
  for (const key of [
    'innopay_lastBalance', 'innopay_lastBalance_timestamp', 'innopay_balance_trustUntil',
    'innopay_flow6_cooldown_until', 'innopay_latestMemoContent', 'innopay_latestMemoDateTime',
    'innopay_fulfilledDetectedAt', 'innopay_wallet_credentials', 'innopay_credentialToken',
  ]) storage.removeItem(key);
}

export const walletImportMessages = {
  en: {
    importAnother: 'Import another wallet',
    title: 'Replace the wallet on this device',
    current: 'Current wallet',
    incoming: 'Newly imported wallet',
    explanation: 'Choose which wallet to use in this browser. Both accounts remain available to import again.',
    replace: 'Replace',
    keep: 'Keep existing',
  },
  fr: {
    importAnother: 'Importer un autre portefeuille',
    title: 'Remplacer le portefeuille sur cet appareil',
    current: 'Portefeuille actuel',
    incoming: 'Portefeuille importé',
    explanation: 'Choisissez le portefeuille à utiliser dans ce navigateur. Les deux comptes pourront être réimportés.',
    replace: 'Remplacer',
    keep: 'Garder le portefeuille actuel',
  },
  de: {
    importAnother: 'Andere Wallet importieren',
    title: 'Wallet auf diesem Gerät ersetzen',
    current: 'Aktuelle Wallet',
    incoming: 'Neu importierte Wallet',
    explanation: 'Wählen Sie die Wallet für diesen Browser. Beide Konten können erneut importiert werden.',
    replace: 'Ersetzen',
    keep: 'Bestehende behalten',
  },
  lb: {
    importAnother: 'En anere Portmonni importéieren',
    title: 'De Portmonni op dësem Apparat ersetzen',
    current: 'Aktuelle Portmonni',
    incoming: 'Nei importéierte Portmonni',
    explanation: 'Wielt de Portmonni fir dëse Browser. Béid Konte kënnen nees importéiert ginn.',
    replace: 'Ersetzen',
    keep: 'Den aktuelle behalen',
  },
};

/** Remove the saved identity on this origin. Spokes must also clear their key cache. */
export function clearSavedWallet(storage: Pick<Storage, 'removeItem'>): void {
  clearWalletContext(storage);
  for (const key of [
    'innopay_accountName', 'innopayAccountName', 'innopay_activePrivate', 'innopay_memoPrivate',
    'innopay_masterPassword', 'innopayMasterPassword', 'innopay_seed', 'innopaySeed',
    'innopay_postingPrivate', 'innopay_postingPublic', 'innopay_activePublic', 'innopay_memoPublic',
    'innopay_ownerPrivate', 'innopay_ownerPublic', 'innopay_email', 'innopay_accounts',
    'innopay_import_attempts', 'innopay_pending_order', 'innopay_flow_pending', 'innopay_wallet_hidden',
  ]) storage.removeItem(key);
}
