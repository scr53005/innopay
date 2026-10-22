import { describe, expect, it } from 'vitest';
import { parseWalletImport, vendorImportAccounts, walletImportAction } from './wallet-import';

const incoming = { accountName: 'hatch-test', keys: { active: '5active', memo: '5memo' } };

describe('wallet imports', () => {
  it('asks before replacing a different wallet', () => {
    expect(walletImportAction('inno000-000-002', 'hatch-test')).toBe('confirm');
  });
  it('keeps the existing wallet when requested', () => {
    expect(walletImportAction('inno000-000-002', 'hatch-test', 'keep')).toBe('keep');
  });
  it('accepts an explicit replacement', () => {
    expect(walletImportAction('inno000-000-002', 'hatch-test', 'replace')).toBe('import');
  });
  it('imports into an empty browser or refreshes the same account directly', () => {
    expect(walletImportAction(null, 'hatch-test')).toBe('import');
    expect(walletImportAction('hatch-test', 'hatch-test')).toBe('import');
  });
  it('rejects a different account when signing into a vendor admin', () => {
    expect(() => parseWalletImport({ ...incoming, accountName: 'inno000-000-002' }, 'hatch-test'))
      .toThrow('@hatch-test');
    expect(parseWalletImport(incoming, 'hatch-test')).toEqual(incoming);
  });
  it('shows only the vendor account when the verified email owns several wallets', () => {
    const accounts = [{ accountName: 'inno000-000-002' }, { accountName: 'hatch-test' }];
    expect(vendorImportAccounts(accounts, 'hatch-test')).toEqual([{ accountName: 'hatch-test' }]);
    expect(vendorImportAccounts(accounts)).toEqual(accounts);
    expect(() => vendorImportAccounts([{ accountName: 'inno000-000-002' }], 'hatch-test')).toThrow('@hatch-test');
  });
  it('rejects incomplete credentials instead of mixing old and new keys', () => {
    for (const data of [null, {}, { accountName: '' }, { ...incoming, keys: null },
      { ...incoming, keys: { active: '5active' } }, { ...incoming, keys: { active: '', memo: '5memo' } }]) {
      expect(() => parseWalletImport(data)).toThrow();
    }
  });
  it('does not retain master passwords or posting keys from legacy responses', () => {
    expect(parseWalletImport({ ...incoming, masterPassword: 'secret', keys: { ...incoming.keys, posting: 'secret' } }))
      .toEqual(incoming);
  });
});
