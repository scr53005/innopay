import { describe, expect, it, vi } from 'vitest';
import { fetchRubisBalance, parseRubisRows, readCachedRubis, saveCachedRubis, RUBIS_CACHE_KEY } from './rubis-balance';

describe('parseRubisRows', () => {
  it('reads the RUBIS row', () => {
    expect(parseRubisRows([{ symbol: 'RUBIS', balance: '3.5' }])).toBe(3.5);
  });
  it('no RUBIS row = never received any = 0 (the strip shows 0)', () => {
    expect(parseRubisRows([])).toBe(0);
    expect(parseRubisRows([{ symbol: 'EURO', balance: '12' }])).toBe(0);
  });
  it('malformed answers are unknown (null), never a wrong 0', () => {
    expect(parseRubisRows(undefined)).toBeNull();
    expect(parseRubisRows({ result: [] })).toBeNull();
    expect(parseRubisRows([{ symbol: 'RUBIS', balance: 'abc' }])).toBeNull();
    expect(parseRubisRows([{ symbol: 'RUBIS', balance: '-1' }])).toBeNull();
  });
});

describe('fetchRubisBalance', () => {
  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it('asks Hive-Engine for this account\'s RUBIS', async () => {
    const fetchImpl = answer({ result: [{ symbol: 'RUBIS', balance: '2' }] });
    expect(await fetchRubisBalance('alice', fetchImpl)).toBe(2);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.params.query).toEqual({ account: 'alice', symbol: 'RUBIS' });
  });
  it('HTTP error or network failure = unknown', async () => {
    expect(await fetchRubisBalance('alice', answer({}, false))).toBeNull();
    expect(await fetchRubisBalance('alice', vi.fn(async () => { throw new Error('offline'); }))).toBeNull();
  });
});

describe('RUBIS cache', () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { store, storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } };
  };
  it('round-trips for the same account', () => {
    const { storage } = memory();
    expect(readCachedRubis(storage, 'alice')).toBeNull();
    saveCachedRubis(storage, 'alice', 4);
    expect(readCachedRubis(storage, 'alice')).toBe(4);
  });
  it('never shows one account\'s RUBIS on another account', () => {
    const { storage } = memory();
    saveCachedRubis(storage, 'alice', 4);
    expect(readCachedRubis(storage, 'bob')).toBeNull();
  });
  it('rejects garbage', () => {
    const { store, storage } = memory();
    store.set(RUBIS_CACHE_KEY, 'not json');
    expect(readCachedRubis(storage, 'alice')).toBeNull();
    store.set(RUBIS_CACHE_KEY, JSON.stringify({ accountName: 'alice', rubis: 'x' }));
    expect(readCachedRubis(storage, 'alice')).toBeNull();
  });
});
