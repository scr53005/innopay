import { expect, it } from 'vitest';
import { clearSavedWallet } from './wallet-import';

it('removes the saved account, keys and wallet caches but preserves unrelated state', () => {
  const storage = new Map([
    ['innopay_accountName', 'old-account'], ['innopayAccountName', 'legacy-account'],
    ['innopay_activePrivate', 'active'], ['innopay_memoPrivate', 'memo'],
    ['innopay_masterPassword', 'master'], ['innopayMasterPassword', 'legacy-master'],
    ['innopay_seed', 'seed'], ['innopaySeed', 'legacy-seed'],
    ['innopay_postingPrivate', 'posting'], ['innopay_ownerPrivate', 'owner'],
    ['innopay_email', 'old@example.com'], ['innopay_lastBalance', '100'],
    ['innopay_wallet_credentials', 'blob'], ['innopay_credentialToken', 'token'],
    ['innopay_pending_order', 'old-order'], ['innopay_flow_pending', 'old-flow'],
    ['innopay_language', 'en'], ['shopping_cart', 'cart'], ['other-app', 'keep'],
  ]);
  clearSavedWallet({ removeItem: key => { storage.delete(key); } });
  expect([...storage]).toEqual([['innopay_language', 'en'], ['shopping_cart', 'cart'], ['other-app', 'keep']]);
});
