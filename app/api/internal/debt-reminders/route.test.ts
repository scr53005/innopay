import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ wallet: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { walletuser: { findFirst: mocks.wallet } } }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('debtor reminder funding guard', () => {
  it('does not email a funded customer even if a stale caller still reports default', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    for (const shortfall_hbd of [0, -9.154]) {
      const response = await POST(new NextRequest('https://wallet.example/api/internal/debt-reminders', {
        method: 'POST', headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_name: 'inno000-000-020', debt_total_hbd: 2.522, shortfall_hbd }),
      }));
      expect(await response.json()).toMatchObject({ sent: false, reason: 'no_actual_shortfall' });
    }
    expect(mocks.wallet).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
