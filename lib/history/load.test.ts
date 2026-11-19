import { describe, expect, it, vi } from 'vitest';
import { HISTORY_PAGE_SIZE, loadHistoryPage } from './load';
import type { EngineHistoryEntry } from './classify';

const me = 'inno000-000-025';
const transfer = (i: number, e: Partial<EngineHistoryEntry> = {}): EngineHistoryEntry => ({
  operation: 'tokens_transfer', from: me, to: 'innopay', symbol: 'EURO', quantity: '1',
  memo: `kcs-inno-ref${i}-xxxx`, timestamp: 1773342534 - i, transactionId: `tx${i}`, ...e,
});
const deps = (entries: EngineHistoryEntry[]) => ({
  fetchEngineHistory: vi.fn(async () => entries),
  getShopByAccount: vi.fn(async () => new Map([['indies.cafe', { id: 'indies', name: 'Indies' }]])),
  getRecipientsByReference: vi.fn(async () => new Map([['kcs-inno-ref0-xxxx', 'indies.cafe'], ['kcs-inno-ref1-xxxx', 'other.shop']])),
});

describe('loadHistoryPage', () => {
  it('names shops from the payer rows, falling back to @recipient for an unregistered one', async () => {
    const d = deps([transfer(0), transfer(1), transfer(2)]);
    const page = await loadHistoryPage(me, 0, 'all', d);
    expect(page.movements.map((m) => m.shop?.name)).toEqual(['Indies', '@other.shop', undefined]);
    expect(d.getRecipientsByReference).toHaveBeenCalledWith(me, ['kcs-inno-ref0-xxxx', 'kcs-inno-ref1-xxxx', 'kcs-inno-ref2-xxxx']);
    expect(page.nextOffset).toBeNull(); // short page = end of history
  });
  it('asks order_payer only about references the customer SENT', async () => {
    const d = deps([transfer(0, { from: 'innopay', to: me, memo: 'Solde mis à jour! / Balance updated!' })]);
    await loadHistoryPage(me, 0, 'all', d);
    expect(d.getRecipientsByReference).not.toHaveBeenCalled();
  });
  it('advances the offset by the raw page, even past ignored rows', async () => {
    const entries = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) => transfer(i, { symbol: i % 2 ? 'BEE' : 'EURO' }));
    const page = await loadHistoryPage(me, 100, 'all', deps(entries));
    expect(page.movements).toHaveLength(HISTORY_PAGE_SIZE / 2);
    expect(page.nextOffset).toBe(100 + HISTORY_PAGE_SIZE);
  });
  it('the RUBIS filter asks Hive-Engine for RUBIS only', async () => {
    const d = deps([]);
    await loadHistoryPage(me, 0, 'RUBIS', d);
    expect(d.fetchEngineHistory).toHaveBeenCalledWith(me, 0, HISTORY_PAGE_SIZE, 'RUBIS');
    await loadHistoryPage(me, 0, 'all', d);
    expect(d.fetchEngineHistory).toHaveBeenLastCalledWith(me, 0, HISTORY_PAGE_SIZE, undefined);
  });
});
