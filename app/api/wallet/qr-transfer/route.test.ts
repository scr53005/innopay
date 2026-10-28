import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ send: vi.fn(), key: vi.fn() }));
vi.mock('@hiveio/dhive', () => ({ Client: class { broadcast = { sendOperations: mocks.send }; }, PrivateKey: { fromString: mocks.key } }));
import { POST } from './route';

const encoded = (operation: unknown) => `hive://sign/op/${Buffer.from(JSON.stringify(operation)).toString('base64url')}`;
const transfer = ['transfer', { from: '__signer', to: 'merchant', amount: '1.250 HBD', memo: 'Lunch' }];
const key = `5${'1'.repeat(50)}`; // Fixture only. Crypto and broadcasts are mocked.
const request = (overrides = {}, url = 'https://wallet.innopay.lu/api/wallet/qr-transfer', origin = 'https://wallet.innopay.lu') => new NextRequest(url, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ raw: encoded(transfer), accountName: 'alice', activePrivateKey: key, ...overrides }),
});
beforeEach(() => { vi.clearAllMocks(); mocks.key.mockReturnValue('mock-key'); mocks.send.mockResolvedValue({ id: 'mock-transaction' }); });
describe('isolated QR transfer endpoint', () => {
  it('revalidates the QR and signs exactly the reviewed transfer with the supplied user key', async () => {
    const response = await POST(request({ useInnopayAuthority: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'submitted', txId: 'mock-transaction' });
    expect(mocks.key).toHaveBeenCalledWith(key);
    expect(mocks.send).toHaveBeenCalledWith([['transfer', { from: 'alice', to: 'merchant', amount: '1.250 HBD', memo: 'Lunch' }]], 'mock-key');
  });
  it.each(['EURO', 'LEI'])('revalidates the %s token and canonical authority on the server', async symbol => {
    const operation = ['custom_json', { id: 'ssc-mainnet-hive', required_auths: ['__signer'], required_posting_auths: [], json: JSON.stringify({ contractName: 'tokens', contractAction: 'transfer', contractPayload: { symbol, to: 'merchant', quantity: '2.50', memo: '' } }) }];
    const response = await POST(request({ raw: encoded(operation) }));
    expect(response.status).toBe(200);
    const sent = mocks.send.mock.calls[0][0][0];
    expect(sent[1].required_auths).toEqual(['alice']);
    expect(JSON.parse(sent[1].json).contractPayload.symbol).toBe(symbol);
  });
  it('rejects different origins, insecure non-loopback origins, invalid keys and non-transfer requests before any broadcast', async () => {
    for (const input of [
      request({}, undefined, 'https://evil.example'),
      request({}, 'http://192.168.1.2:3000/api/wallet/qr-transfer', 'http://192.168.1.2:3000'),
      request({ activePrivateKey: 'not-a-key' }), request({ raw: 'https://pay.innopay.lu/' }), request({ accountName: 'mallory', raw: encoded(['transfer', { ...(transfer[1] as object), from: 'alice' }]) }),
    ]) expect((await POST(input)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('reports an ambiguous outcome and never retries or falls back to hub authority', async () => {
    mocks.send.mockRejectedValue(new Error('Network interrupted after submission'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ status: 'unknown' });
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.key).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(' ')).not.toContain(key); log.mockRestore();
  });
});
