import { describe, expect, it } from 'vitest';
import { approvedQrLink, parseQrRequest, QrRequestError } from './qr-request';

const uri = (operation: unknown, query = '') => `hive://sign/op/${Buffer.from(JSON.stringify(operation)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '.')}${query}`;
const native = (asset = 'HBD', extra = {}) => ['transfer', { from: '__signer', to: 'merchant', amount: `1.250 ${asset}`, memo: 'Café — mulțumesc 🥐', ...extra }];
const token = (symbol = 'EURO', extra = {}) => ['custom_json', {
  id: 'ssc-mainnet-hive', required_auths: ['__signer'], required_posting_auths: [],
  json: JSON.stringify({ contractName: 'tokens', contractAction: 'transfer', contractPayload: { symbol, to: 'merchant', quantity: '12.50', memo: 'Merci __signer', ...extra } }),
}];
function errorCode(action: () => unknown) {
  try { action(); throw new Error('Expected a rejected request'); }
  catch (error) { expect(error).toBeInstanceOf(QrRequestError); return (error as QrRequestError).code; }
}
describe('QR destination policy', () => {
  it.each(['https://innopay.lu/', 'https://wallet.innopay.lu/user?choice=import', 'https://offchain.lu/', 'https://pay.offchain.lu/table/12', 'https://PAY.INNOPAY.LU:443/'])('allows %s without requiring a wallet', value => {
    expect(parseQrRequest(value)).toMatchObject({ kind: 'link' });
  });
  it.each([
    'https://innopay.lu.evil.example/', 'https://fakeinnopay.lu/', 'https://eviloffchain.lu/', 'https://offchain.lu.evil.example/',
    'https://innopay.lu@evil.example/', 'https://evil:password@innopay.lu/', 'https://innopay.lu:8443/',
    'http://innopay.lu.evil.example/', 'http://evil:password@indies.innopay.lu/', 'http://indies.innopay.lu:8080/',
    'javascript:alert(1)', '//innopay.lu/', 'https://innopay.lu./', 'https://inno\npay.lu/',
  ])('blocks %s', value => { expect(() => approvedQrLink(value)).toThrow(QrRequestError); });
  it('upgrades an approved legacy Indies URL before presenting it, keeping the table and other parameters', () => {
    expect(parseQrRequest('http://indies.innopay.lu/menu?table=16&lang=fr#menu')).toEqual({
      kind: 'link', hostname: 'indies.innopay.lu', href: 'https://indies.innopay.lu/menu?table=16&lang=fr#menu',
    });
  });
});
describe('single-operation Hive transfer requests', () => {
  it.each(['HIVE', 'HBD'])('reviews and rebuilds a %s transfer, including UTF-8 memo', asset => {
    expect(parseQrRequest(uri(native(asset)), 'alice')).toEqual({
      kind: 'transfer', from: 'alice', to: 'merchant', amount: '1.250', asset, memo: 'Café — mulțumesc 🥐',
      operation: ['transfer', { from: 'alice', to: 'merchant', amount: `1.250 ${asset}`, memo: 'Café — mulțumesc 🥐' }],
    });
  });
  it.each(['EURO', 'LEI'])('accepts only a token transfer for %s with the selected wallet authority', asset => {
    const result = parseQrRequest(uri(token(asset)), 'alice');
    expect(result).toMatchObject({ kind: 'transfer', from: 'alice', to: 'merchant', amount: '12.50', asset, memo: 'Merci alice' });
    if (result.kind !== 'transfer' || result.operation[0] !== 'custom_json') throw new Error('Expected token transfer');
    expect(result.operation[1].required_auths).toEqual(['alice']);
    expect(JSON.parse(result.operation[1].json).contractPayload).toMatchObject({ symbol: asset, quantity: '12.50', memo: 'Merci alice' });
  });
  it('requires a wallet only for signing requests', () => {
    expect(errorCode(() => parseQrRequest(uri(native())))).toBe('walletRequired');
  });
  it('rejects a sending account or requested signer that differs from the saved wallet', () => {
    expect(errorCode(() => parseQrRequest(uri(native('HBD', { from: 'mallory' })), 'alice'))).toBe('wrongAccount');
    expect(errorCode(() => parseQrRequest(uri(native(), '?s=mallory'), 'alice'))).toBe('wrongAccount');
  });
  it.each(['?nb=', '?cb=aHR0cHM6Ly9pbm5vcGF5Lmx1', '?a=owner', '?s=alice&s=mallory'])('does not silently change signing-mode options: %s', query => {
    expect(errorCode(() => parseQrRequest(uri(native(), query), 'alice'))).toBe('unsupportedOptions');
  });
  it.each(['0.000 HBD', '-1.000 HBD', '1e3 HBD', '1.000 VESTS', '01.000 HBD', '1.0000 HIVE'])('rejects invalid or unsupported native amount %s', amount => {
    expect(() => parseQrRequest(uri(native('HBD', { amount })), 'alice')).toThrow(QrRequestError);
  });
  it.each(['0', '-1', '1e3', '1.2345', 'Infinity'])('rejects invalid token quantity %s', quantity => {
    expect(() => parseQrRequest(uri(token('EURO', { quantity })), 'alice')).toThrow(QrRequestError);
  });
  it('rejects other operation types, extra native fields, multi-ops and other token actions/symbols', () => {
    for (const operation of [
      ['account_update', { account: 'alice' }], native('HBD', { authority: 'owner' }), [native(), native()], token('BEE'),
      ['custom_json', { id: 'ssc-mainnet-hive', required_auths: ['alice'], required_posting_auths: [], json: JSON.stringify({ contractName: 'tokens', contractAction: 'stake', contractPayload: {} }) }],
      ['custom_json', { id: 'ssc-mainnet-hive', required_auths: ['alice', 'mallory'], required_posting_auths: [], json: '{}' }],
    ]) expect(() => parseQrRequest(uri(operation), 'alice')).toThrow(QrRequestError);
  });
  it('rejects malformed encoding and oversized requests/memos', () => {
    expect(() => parseQrRequest('hive://sign/op/a', 'alice')).toThrow(QrRequestError);
    expect(() => parseQrRequest('x'.repeat(12001), 'alice')).toThrow(QrRequestError);
    expect(() => parseQrRequest(uri(native('HBD', { memo: 'é'.repeat(1025) })), 'alice')).toThrow(QrRequestError);
  });
});
