import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import { importManualWallet, validateManualWallet, type HiveImportAccount } from './manual-wallet-import';

// Synthetic keys only; these are not associated with a real wallet.
const active = PrivateKey.fromSeed('manual-import-test-active');
const memo = PrivateKey.fromSeed('manual-import-test-memo');
const other = PrivateKey.fromSeed('manual-import-test-other');
const account: HiveImportAccount = {
  name: 'hatch-test', memo_key: memo.createPublic().toString(),
  active: { weight_threshold: 1, key_auths: [[active.createPublic().toString(), 1]] },
};
afterEach(() => vi.unstubAllGlobals());

describe('manual wallet import', () => {
  it('imports a chain account without a database record and normalizes pasted input', () => {
    expect(validateManualWallet(' @HATCH-TEST ', ` ${active} `, ` ${memo} `, account, 'hatch-test')).toEqual({
      accountName: 'hatch-test', keys: { active: active.toString(), memo: memo.toString() },
    });
  });
  it('rejects keys for a different account', () => {
    expect(() => validateManualWallet('hatch-test', other.toString(), memo.toString(), account)).toThrow('active key');
    expect(() => validateManualWallet('hatch-test', active.toString(), other.toString(), account)).toThrow('memo key');
  });
  it('rejects insufficient active authority', () => {
    expect(() => validateManualWallet('hatch-test', active.toString(), memo.toString(), {
      ...account, active: { ...account.active, weight_threshold: 2 },
    })).toThrow('authorize payments');
  });
  it('rejects a different vendor or a nonexistent chain account', () => {
    expect(() => validateManualWallet('other-vendor', active.toString(), memo.toString(), account, 'hatch-test')).toThrow('Import @hatch-test');
    expect(() => validateManualWallet('hatch-test', active.toString(), memo.toString(), null)).toThrow('not found on Hive');
  });
  it('does not echo malformed private keys in errors', () => {
    const invalid = 'private-secret-value';
    expect(() => validateManualWallet('hatch-test', invalid, memo.toString(), account)).toThrow('valid active private key');
    try { validateManualWallet('hatch-test', invalid, memo.toString(), account); }
    catch (error) { expect(String(error)).not.toContain(invalid); }
  });
  it('sends only the account name to Hive and never calls the hub', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [account] })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await importManualWallet('hatch-test', active.toString(), memo.toString())).accountName).toBe('hatch-test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.hive.blog');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params).toEqual([['hatch-test']]);
    const transmitted = JSON.stringify(fetchMock.mock.calls);
    expect(transmitted).not.toContain(active.toString());
    expect(transmitted).not.toContain(memo.toString());
  });
  it('retries a failed public node without saving anything', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response(JSON.stringify({ result: [account] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(importManualWallet('hatch-test', active.toString(), memo.toString())).resolves.toMatchObject({ accountName: 'hatch-test' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('fails closed on a network outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(importManualWallet('hatch-test', active.toString(), memo.toString())).rejects.toThrow('Could not check');
  });
  it('does not contact Hive for malformed keys or a different required account', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(importManualWallet('hatch-test', 'bad-key', memo.toString())).rejects.toThrow('valid active');
    await expect(importManualWallet('other-vendor', active.toString(), memo.toString(), 'hatch-test')).rejects.toThrow('Import @hatch-test');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
