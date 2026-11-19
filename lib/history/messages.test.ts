import { describe, expect, it } from 'vitest';
import { formatMovementAmount, historyMessages, movementLabel, type HistoryLanguage } from './messages';
import type { AccountMovement } from './movement';

const row = (m: Partial<AccountMovement>) => ({
  account: 'me', at: '2026-11-19T10:00:00Z', kind: 'order', symbol: 'EURO', amount: -3.5,
  counterparty: 'innopay', source: 'hive-engine', tx_id: 'tx', ...m,
}) as AccountMovement;

describe('movementLabel', () => {
  it('uses the shop name when known, the generic label otherwise', () => {
    expect(movementLabel(row({ shop: { name: 'Indies' } }), 'en')).toBe('Order at Indies');
    expect(movementLabel(row({}), 'fr')).toBe('Paiement d’une commande');
    expect(movementLabel(row({ kind: 'transfer_out', counterparty: 'friend' }), 'de')).toBe('Gesendet an @friend');
  });
  it('has every kind in every language, with no leftover placeholder', () => {
    for (const language of Object.keys(historyMessages) as HistoryLanguage[]) {
      for (const kind of Object.keys(historyMessages.en.kinds) as AccountMovement['kind'][]) {
        for (const shop of [undefined, { name: 'Indies' }]) {
          const label = movementLabel(row({ kind, shop }), language);
          expect(label, `${language}/${kind}`).not.toMatch(/\{|^$/);
        }
      }
    }
  });
});

describe('formatMovementAmount', () => {
  it('signs, rounds and picks the unit per token', () => {
    expect(formatMovementAmount(12.5, 'EURO')).toBe('+12.50 €');
    expect(formatMovementAmount(-3.51, 'EURO')).toBe('−3.51 €');
    expect(formatMovementAmount(6, 'RUBIS')).toBe('+6 ◆');
    expect(formatMovementAmount(-0.1, 'RUBIS')).toBe('−0.1 ◆');
    expect(formatMovementAmount(40, 'LEI')).toBe('+40.00 lei');
  });
});
