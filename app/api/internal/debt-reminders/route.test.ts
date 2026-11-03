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

describe('debtor reminder recipient', () => {
  const remind = (account_name: string) => POST(new NextRequest('https://wallet.example/api/internal/debt-reminders', {
    method: 'POST', headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name, debt_total_hbd: 5, shortfall_hbd: 2 }),
  }));

  it('sends an @innopay reminder to the Innopay team instead of failing with no_linked_email', async () => {
    // Regression: Liman logged "Debtor reminder not sent for @innopay: no_linked_email" every run.
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    mocks.send.mockResolvedValue({});
    const body = await (await remind('@innopay')).json();
    expect(body).toMatchObject({ sent: true, email: 'contact@innopay.lu' });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'contact@innopay.lu' }));
    expect(mocks.wallet).not.toHaveBeenCalled();
  });

  it('lets INNOPAY_TREASURY_EMAIL override the treasury address', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    vi.stubEnv('INNOPAY_TREASURY_EMAIL', 'ops@innopay.lu');
    mocks.send.mockResolvedValue({});
    expect(await (await remind('innopay')).json()).toMatchObject({ sent: true, email: 'ops@innopay.lu' });
  });

  it('still uses the linked email for customers, and reports a customer without one', async () => {
    vi.stubEnv('LIMAN_API_KEY', 'test-key');
    mocks.wallet.mockResolvedValueOnce({ innouser: { email: 'alice@example.com' } });
    mocks.send.mockResolvedValue({});
    expect(await (await remind('alice')).json()).toMatchObject({ sent: true, email: 'alice@example.com' });
    mocks.wallet.mockResolvedValueOnce(null);
    expect(await (await remind('bob')).json()).toMatchObject({ sent: false, reason: 'no_linked_email' });
  });
});
