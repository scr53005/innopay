import { describe, expect, it } from 'vitest';
import { classifyMovement, rubisTotals, type ClassifyContext, type EngineHistoryEntry } from './classify';
import type { AccountMovement } from './movement';

const me = 'inno000-000-025';
const indies = { id: 'indies', name: 'Indies' };
const ctx: ClassifyContext = {
  shopByAccount: new Map([['indies.cafe', indies]]),
  shopByReference: new Map([['kcs-inno-lwt4-drol', indies]]),
};
const entry = (e: Partial<EngineHistoryEntry>): EngineHistoryEntry => ({
  operation: 'tokens_transfer', from: 'innopay', to: me, symbol: 'EURO', quantity: '10',
  memo: '', timestamp: 1773342534, transactionId: 'tx1', ...e,
});
const kindOf = (e: Partial<EngineHistoryEntry>) => classifyMovement(entry(e), me, ctx)?.kind;

describe('classifyMovement', () => {
  // Real entries from inno000-000-025's history (2026-03).
  it('reads a wallet order paid to @innopay and names the shop from order_payer', () => {
    expect(classifyMovement(entry({ from: me, to: 'innopay', quantity: '3.51', memo: 'kcs-inno-lwt4-drol' }), me, ctx)).toEqual({
      account: me, at: '2026-03-12T19:08:54.000Z', kind: 'order', symbol: 'EURO', amount: -3.51,
      counterparty: 'innopay', shop: indies, ref: 'kcs-inno-lwt4-drol', source: 'hive-engine', tx_id: 'tx1',
    } satisfies AccountMovement);
  });
  it('reads the account-creation credit and a later top-up as top-ups', () => {
    expect(kindOf({ memo: 'Bienvenue dans le système Innopay! / Welcome to Innopay!' })).toBe('topup');
    expect(kindOf({ memo: 'Solde mis à jour! / Balance updated!' })).toBe('topup');
    expect(kindOf({ memo: 'Monnaie / Change' })).toBe('change');
  });
  it('an order whose payer row is missing still reads as an order, without a shop', () => {
    const m = classifyMovement(entry({ from: me, to: 'innopay', memo: 'd:1 TABLE 4 kcs-inno-zzzz-zzzz' }), me, ctx);
    expect(m?.kind).toBe('order');
    expect(m?.shop).toBeUndefined();
  });
  it('a direct payment to the shop names it from the account', () => {
    const m = classifyMovement(entry({ from: me, to: 'indies.cafe', memo: 'TABLE 2 kcs-inno-aaaa-bbbb' }), me, ctx);
    expect(m).toMatchObject({ kind: 'order', shop: indies, amount: -10 });
  });
  it('reads RUBIS earned from the @innopay thank-you memo, shop name included', () => {
    expect(classifyMovement(entry({ symbol: 'RUBIS', quantity: '1.25', memo: 'RUBIS · merci ! — Millewee' }), me, ctx))
      .toMatchObject({ kind: 'rubis_earned', amount: 1.25, shop: { name: 'Millewee' } });
  });
  it('reads RUBIS spent at a shop, photo rewards, messages and message rewards', () => {
    expect(kindOf({ symbol: 'RUBIS', from: me, to: 'indies.cafe', memo: 'kcs-inno-aaaa-bbbb' })).toBe('rubis_spent');
    expect(classifyMovement(entry({ symbol: 'RUBIS', from: 'indies.cafe', memo: 'photo:42' }), me, ctx))
      .toMatchObject({ kind: 'photo_reward', shop: indies });
    expect(kindOf({ symbol: 'RUBIS', from: me, to: 'indies.cafe', memo: 'm1:s:#abc' })).toBe('message');
    expect(kindOf({ symbol: 'RUBIS', from: 'indies.cafe', memo: 'msg-reward:tx9' })).toBe('message_reward');
  });
  it('anything else is a plain transfer in or out', () => {
    expect(kindOf({ from: 'friend', memo: 'thanks' })).toBe('transfer_in');
    expect(kindOf({ from: me, to: 'friend', memo: 'lunch' })).toBe('transfer_out');
    // A RUBIS memo that merely LOOKS like a top-up is not one.
    expect(kindOf({ symbol: 'RUBIS', memo: 'Solde mis à jour! / Balance updated!' })).toBe('transfer_in');
  });
  it('ignores other operations, other tokens, self-transfers and unrelated rows', () => {
    expect(kindOf({ operation: 'tokens_stake' })).toBeUndefined();
    expect(kindOf({ symbol: 'BEE' })).toBeUndefined();
    expect(kindOf({ from: me, to: me })).toBeUndefined();
    expect(kindOf({ from: 'a', to: 'b' })).toBeUndefined();
    expect(kindOf({ quantity: 'abc' })).toBeUndefined();
  });
});

describe('rubisTotals', () => {
  it('sums RUBIS earned and spent, cents-exact, ignoring other tokens', () => {
    const m = (symbol: string, amount: number) => ({ symbol, amount }) as AccountMovement;
    expect(rubisTotals([m('RUBIS', 0.1), m('RUBIS', 0.2), m('RUBIS', -0.1), m('EURO', 50)])).toEqual({ earned: 0.3, spent: 0.1 });
  });
});
