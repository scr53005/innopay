import { describe, expect, it } from 'vitest';
import { saveHubWalletImport } from './hub-wallet-import';

function oldWallet(): Storage {
  const values = new Map<string, string>([
    ['innopay_accountName', 'inno000-000-002'], ['innopayAccountName', 'inno000-000-002'],
    ['innopay_activePrivate', 'old-active'], ['innopay_memoPrivate', 'old-memo'],
    ['innopay_masterPassword', 'old-master'], ['innopayMasterPassword', 'old-legacy-master'],
    ['innopay_seed', 'old-seed'], ['innopaySeed', 'old-legacy-seed'],
    ['innopay_postingPrivate', 'old-posting'], ['innopay_ownerPrivate', 'old-owner'],
    ['innopay_lastBalance', '1.83'], ['innopay_balance_trustUntil', '9999999999999'],
    ['innopay_email', 'old@example.com'], ['innopay_wallet_credentials', 'old-blob'],
    ['innopay_language', 'fr'], ['shopping_cart', 'keep-this'],
  ]);
  return { get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }, key: (index) => [...values.keys()][index] ?? null };
}
const incoming = { accountName: 'hatch-test', keys: { active: '5new-active', memo: '5new-memo' } };

describe('saving a hub wallet import', () => {
  it.each([undefined, 'keep'] as const)('does not change any stored values before replacement is accepted (%s)', (choice) => {
    const storage = oldWallet();
    const before = Array.from({ length: storage.length }, (_, i) => storage.key(i)!).map(k => [k, storage.getItem(k)]);
    expect(saveHubWalletImport(storage, incoming, 'new@example.com', choice)).toBe(choice === 'keep' ? 'keep' : 'confirm');
    expect(Array.from({ length: storage.length }, (_, i) => storage.key(i)!).map(k => [k, storage.getItem(k)])).toEqual(before);
  });
  it('replaces the account and both keys and removes stale identity and balance data', () => {
    const storage = oldWallet();
    expect(saveHubWalletImport(storage, incoming, ' NEW@example.com ', 'replace')).toBe('import');
    expect(storage.getItem('innopay_accountName')).toBe('hatch-test');
    expect(storage.getItem('innopay_activePrivate')).toBe('5new-active');
    expect(storage.getItem('innopay_memoPrivate')).toBe('5new-memo');
    expect(storage.getItem('innopay_email')).toBe('new@example.com');
    for (const key of ['innopayAccountName', 'innopay_masterPassword', 'innopayMasterPassword',
      'innopay_seed', 'innopaySeed', 'innopay_postingPrivate', 'innopay_ownerPrivate',
      'innopay_lastBalance', 'innopay_balance_trustUntil', 'innopay_wallet_credentials']) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem('innopay_language')).toBe('fr');
    expect(storage.getItem('shopping_cart')).toBe('keep-this');
  });
  it('does not modify the old wallet if the new response lacks keys', () => {
    const storage = oldWallet();
    expect(() => saveHubWalletImport(storage, { accountName: 'hatch-test' }, 'new@example.com', 'replace')).toThrow();
    expect(storage.getItem('innopay_accountName')).toBe('inno000-000-002');
    expect(storage.getItem('innopay_activePrivate')).toBe('old-active');
  });
  it('preserves the hub credential contract using only values from the newly verified account', () => {
    const storage = oldWallet();
    saveHubWalletImport(storage, { ...incoming, masterPassword: 'new-master', seed: 'new-seed',
      keys: { ...incoming.keys, posting: 'new-posting' } }, 'new@example.com', 'replace');
    expect(storage.getItem('innopay_masterPassword')).toBe('new-master');
    expect(storage.getItem('innopay_seed')).toBe('new-seed');
    expect(storage.getItem('innopay_postingPrivate')).toBe('new-posting');
  });
  it('recognizes a legacy stored wallet when deciding whether to ask', () => {
    const storage = oldWallet();
    storage.removeItem('innopay_accountName');
    expect(saveHubWalletImport(storage, incoming, 'new@example.com')).toBe('confirm');
  });
  it('imports directly when no wallet exists', () => {
    const storage = oldWallet();
    storage.clear();
    expect(saveHubWalletImport(storage, incoming, 'new@example.com')).toBe('import');
    expect(storage.getItem('innopay_accountName')).toBe('hatch-test');
  });
});

it('does not associate an unverified email with a manual key import', () => {
  const storage = oldWallet();
  expect(saveHubWalletImport(storage, incoming, null, 'replace')).toBe('import');
  expect(storage.getItem('innopay_email')).toBeNull();
  expect(storage.getItem('innopay_masterPassword')).toBeNull();
  expect(storage.getItem('innopay_accountName')).toBe('hatch-test');
});
