import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@hiveio/dhive';
import { isOrderAuthFresh, signOrderAuth, verifyOrderAuth, type OrderAuthFields } from './order-payment-auth';

const key = PrivateKey.fromLogin('alice', 'test-password-not-real', 'active');
const otherKey = PrivateKey.fromLogin('mallory', 'another-password', 'active');
const keyAuths = [key.createPublic().toString()];

const fields: OrderAuthFields = {
  accountName: 'alice',
  restaurantAccount: 'indies.cafe',
  orderAmount: 12.5,
  orderMemo: 'Burger TABLE 4 kcs-inno-ab12-cd34',
  ts: 1_800_000_000_000,
  nonce: 'n-1',
};

describe('order payment auth', () => {
  it('verifies a signature made with the account active key', () => {
    expect(verifyOrderAuth(fields, signOrderAuth(fields, key.toString()), keyAuths)).toBe(true);
  });
  it('refuses a signature from another key (anonymous caller naming a victim)', () => {
    expect(verifyOrderAuth(fields, signOrderAuth(fields, otherKey.toString()), keyAuths)).toBe(false);
  });
  it('refuses a valid signature re-pointed at a different order', () => {
    const sig = signOrderAuth(fields, key.toString());
    expect(verifyOrderAuth({ ...fields, orderAmount: 99 }, sig, keyAuths)).toBe(false);
    expect(verifyOrderAuth({ ...fields, restaurantAccount: 'millewee' }, sig, keyAuths)).toBe(false);
    expect(verifyOrderAuth({ ...fields, orderMemo: 'other' }, sig, keyAuths)).toBe(false);
    expect(verifyOrderAuth({ ...fields, nonce: 'n-2' }, sig, keyAuths)).toBe(false);
  });
  it('refuses garbage signatures', () => {
    expect(verifyOrderAuth(fields, 'not-a-signature', keyAuths)).toBe(false);
  });
  it('enforces freshness', () => {
    const now = fields.ts;
    expect(isOrderAuthFresh(now - 60_000, now)).toBe(true);
    expect(isOrderAuthFresh(now - 3 * 60_000, now)).toBe(false);
    expect(isOrderAuthFresh(now + 2 * 60_000, now)).toBe(false);
    expect(isOrderAuthFresh(NaN, now)).toBe(false);
  });
});
