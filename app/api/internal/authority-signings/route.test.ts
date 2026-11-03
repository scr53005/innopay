import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  default: { innopay_authority_signing: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

const call = (query = '', key = 'test-key') => GET(new NextRequest(
  `https://wallet.example/api/internal/authority-signings${query}`, { headers: { Authorization: `Bearer ${key}` } }));

describe('GET /api/internal/authority-signings', () => {
  it('refuses callers without the Liman key', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    expect((await call('', 'wrong')).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('returns the window rows with decimals as strings and the latest use ever', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    const at = new Date('2026-11-03T10:00:00Z');
    mocks.findMany.mockResolvedValue([{ signer: 'inno000-000-020', mode: 'fallback', symbol: 'EURO',
      quantity: { toString: () => '12.5' }, to_account: 'indies.cafe', tx_id: 'a'.repeat(40), created_at: at }]);
    mocks.findFirst.mockResolvedValue({ created_at: at });
    const body = await (await call('?days=7')).json();
    expect(body).toMatchObject({ days: 7, truncated: false, last_ever_at: at.toISOString(),
      signings: [{ signer: 'inno000-000-020', mode: 'fallback', quantity: '12.5', created_at: at.toISOString() }] });
    const since: Date = mocks.findMany.mock.calls[0][0].where.created_at.gte;
    expect(Date.now() - since.getTime()).toBeCloseTo(7 * 86_400_000, -4);
  });

  it('falls back to 30 days for a missing or out-of-range window', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    for (const query of ['', '?days=0', '?days=9999', '?days=abc']) {
      const body = await (await call(query)).json();
      expect(body).toMatchObject({ days: 30, signings: [], last_ever_at: null });
    }
  });
});
