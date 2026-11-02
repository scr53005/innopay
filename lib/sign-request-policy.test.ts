import { describe, expect, it } from 'vitest';
import { validateSignRequest, type PolicyContext } from './sign-request-policy';

const ctx: PolicyContext = {
  allowedRecipients: new Set(['innopay', 'indies.cafe', 'millewee']),
  protectedSigners: new Set(['innopay', 'indies.cafe', 'millewee']),
};

function op(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}, body: Record<string, unknown> = {}) {
  return {
    required_auths: ['alice'],
    required_posting_auths: [],
    id: 'ssc-mainnet-hive',
    json: JSON.stringify({
      contractName: 'tokens',
      contractAction: 'transfer',
      contractPayload: { symbol: 'EURO', to: 'innopay', quantity: '3.580', memo: 'order -inno-abc', ...payload },
      ...body,
    }),
    ...overrides,
  };
}

describe('validateSignRequest', () => {
  it('accepts a customer EURO payment to innopay (Flow 6 leg 1)', () => {
    const r = validateSignRequest(op(), 'alice', ctx);
    expect(r).toEqual({ ok: true, payment: { signer: 'alice', symbol: 'EURO', to: 'innopay', quantity: '3.580', memo: 'order -inno-abc' } });
  });

  it('accepts a LEI call-waiter fee straight to a spoke account', () => {
    expect(validateSignRequest(op({}, { symbol: 'LEI', to: 'millewee', quantity: '0.020' }), undefined, ctx).ok).toBe(true);
  });

  // The attacks that motivated the fix.
  it('refuses anything signed as innopay (token issue / drain)', () => {
    expect(validateSignRequest(op({ required_auths: ['innopay'] }), undefined, ctx).ok).toBe(false);
  });
  it('refuses a spoke account as signer (innopay has authority over spokes too)', () => {
    expect(validateSignRequest(op({ required_auths: ['indies.cafe'] }), undefined, ctx).ok).toBe(false);
  });
  it('refuses tokens.issue', () => {
    expect(validateSignRequest(op({}, {}, { contractAction: 'issue' }), undefined, ctx).ok).toBe(false);
  });
  it('accepts a customer spending RUBIS at a spoke (split payments)', () => {
    expect(validateSignRequest(op({}, { symbol: 'RUBIS', to: 'indies.cafe' }), undefined, ctx).ok).toBe(true);
  });
  it('still refuses RUBIS signed as innopay (the treasury) and other tokens', () => {
    expect(validateSignRequest(op({ required_auths: ['innopay'] }, { symbol: 'RUBIS' }), undefined, ctx).ok).toBe(false);
    expect(validateSignRequest(op({}, { symbol: 'SWAP.HIVE' }), undefined, ctx).ok).toBe(false);
  });
  it('refuses a transfer to an arbitrary account', () => {
    expect(validateSignRequest(op({}, { to: 'attacker' }), undefined, ctx).ok).toBe(false);
  });
  it('refuses an array of actions smuggled in one custom_json', () => {
    const smuggled = { ...op(), json: JSON.stringify([JSON.parse(op().json), JSON.parse(op().json)]) };
    expect(validateSignRequest(smuggled, undefined, ctx).ok).toBe(false);
  });
  it('refuses multiple signers, posting auths, other ids, extra payload fields', () => {
    expect(validateSignRequest(op({ required_auths: ['alice', 'bob'] }), undefined, ctx).ok).toBe(false);
    expect(validateSignRequest(op({ required_posting_auths: ['alice'] }), undefined, ctx).ok).toBe(false);
    expect(validateSignRequest(op({ id: 'follow' }), undefined, ctx).ok).toBe(false);
    expect(validateSignRequest(op({}, { extra: 1 }), undefined, ctx).ok).toBe(false);
  });
  it('refuses an accountName that differs from the signer', () => {
    expect(validateSignRequest(op(), 'bob', ctx).ok).toBe(false);
  });
  it('refuses bad quantities', () => {
    for (const quantity of ['0', '0.000', '-1', '1e3', '1.2345', '1001', 5]) {
      expect(validateSignRequest(op({}, { quantity }), undefined, ctx).ok).toBe(false);
    }
  });
  it('refuses malformed input', () => {
    expect(validateSignRequest(null, undefined, ctx).ok).toBe(false);
    expect(validateSignRequest(op({ json: '{not json' }), undefined, ctx).ok).toBe(false);
  });
});
