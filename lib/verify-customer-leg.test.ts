import { describe, expect, it } from 'vitest';
import { checkCustomerLeg, type HeTransactionInfo } from './verify-customer-leg';

const expected = { customerAccount: 'alice', tokenSymbol: 'EURO', amount: 3.58, distriateSuffix: 'kcs-inno-ab12-cd34', headHiveBlock: 100_000_000 };

function tx(over: Partial<HeTransactionInfo> = {}, event: Record<string, unknown> = {}, memo = 'items TABLE 4 kcs-inno-ab12-cd34'): HeTransactionInfo {
  return {
    transactionId: 'a'.repeat(40),
    refHiveBlockNumber: 99_999_990,
    sender: 'alice',
    contract: 'tokens',
    action: 'transfer',
    payload: JSON.stringify({ symbol: 'EURO', to: 'innopay', quantity: '3.580', memo }),
    logs: JSON.stringify({ events: [{ contract: 'tokens', event: 'transfer', data: { from: 'alice', to: 'innopay', symbol: 'EURO', quantity: '3.580', ...event } }] }),
    ...over,
  };
}

describe('checkCustomerLeg', () => {
  it('accepts the executed matching transfer', () => {
    expect(checkCustomerLeg(tx(), expected)).toEqual({ ok: true, quantity: 3.58 });
  });
  it('accepts an overpayment and a 2-decimal quantity', () => {
    expect(checkCustomerLeg(tx({}, { quantity: '3.58' }), expected).ok).toBe(true);
    expect(checkCustomerLeg(tx({}, { quantity: '5' }), expected).ok).toBe(true);
  });
  it('refuses a tx sent by someone else (forged customerAccount)', () => {
    expect(checkCustomerLeg(tx({ sender: 'mallory' }), expected).ok).toBe(false);
  });
  it('refuses a transfer Hive-Engine rejected (e.g. empty balance)', () => {
    expect(checkCustomerLeg(tx({ logs: JSON.stringify({ errors: ['overdrawn balance'] }) }), expected).ok).toBe(false);
  });
  it('refuses an underpayment', () => {
    expect(checkCustomerLeg(tx({}, { quantity: '0.010' }), expected).ok).toBe(false);
  });
  it('refuses the wrong token or a transfer to someone other than innopay', () => {
    expect(checkCustomerLeg(tx({}, { symbol: 'LEI' }), expected).ok).toBe(false);
    expect(checkCustomerLeg(tx({}, { to: 'mallory' }), expected).ok).toBe(false);
  });
  it('refuses a real old payment re-used for a different order (memo mismatch)', () => {
    expect(checkCustomerLeg(tx({}, {}, 'items TABLE 4 kcs-inno-zz99-zz99'), expected).ok).toBe(false);
  });
  it('refuses a payment older than the freshness window (replay of historic txs)', () => {
    expect(checkCustomerLeg(tx({ refHiveBlockNumber: 100_000_000 - 601 }), expected).ok).toBe(false);
    expect(checkCustomerLeg(tx({ refHiveBlockNumber: 100_000_000 - 600 }), expected).ok).toBe(true);
    expect(checkCustomerLeg(tx({ refHiveBlockNumber: undefined }), expected).ok).toBe(false);
  });
  it('refuses non-transfer actions and unreadable logs', () => {
    expect(checkCustomerLeg(tx({ action: 'issue' }), expected).ok).toBe(false);
    expect(checkCustomerLeg(tx({ logs: 'not json' }), expected).ok).toBe(false);
  });
});

describe('heExecution', () => {
  it('reads executed, rejected and unknown transactions', async () => {
    const { heExecution } = await import('./verify-customer-leg');
    expect(heExecution(null)).toEqual({ status: 'unknown' });
    expect(heExecution({ logs: 'not json' })).toEqual({ status: 'unknown' });
    expect(heExecution({ logs: JSON.stringify({ events: [] }) })).toEqual({ status: 'executed' });
    expect(heExecution({ logs: JSON.stringify({ errors: ['symbol precision mismatch'] }) }))
      .toEqual({ status: 'rejected', reason: 'rejected by Hive-Engine: symbol precision mismatch' });
  });
});
