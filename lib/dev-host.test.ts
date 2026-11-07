import { expect, it } from 'vitest';
import { isDevHostname } from './dev-host';

it('dev = localhost or the LAN; never the production domains', () => {
  expect(isDevHostname('localhost')).toBe(true);
  expect(isDevHostname('127.0.0.1')).toBe(true);
  expect(isDevHostname('192.168.178.55')).toBe(true);
  expect(isDevHostname('wallet.innopay.lu')).toBe(false);
  expect(isDevHostname('innopay.vercel.app')).toBe(false);
});
