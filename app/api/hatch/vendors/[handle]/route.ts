import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFarmVendor, setFarmVendorActive } from '@/lib/hatch-vendors';
import { transitionVendor } from '@/lib/vendor-archive-transition';

const SPOKE_ID = 'innohatch';

function merchantHubUrl(): string {
  return (process.env.MERCHANT_HUB_URL || 'https://merchant-hub.innopay.lu').replace(/\/$/, '');
}

async function updateHubRegistry(account: string, active: boolean): Promise<void> {
  const environment = process.env.HATCH_TARGET_ENV === 'dev' ? 'dev' : 'prod';
  await prisma.spoke_account.upsert({
    where: {
      spoke_id_hive_account_environment_role: {
        spoke_id: SPOKE_ID, hive_account: account, environment, role: 'orders_and_tips',
      },
    },
    update: { active },
    create: {
      spoke_id: SPOKE_ID, hive_account: account, environment,
      role: 'orders_and_tips', active, settlement_enabled: false,
    },
  });
}

async function updateWatchlist(account: string, active: boolean): Promise<void> {
  const token = process.env.MERCHANT_HUB_ADMIN_TOKEN;
  if (!token) throw new Error('MERCHANT_HUB_ADMIN_TOKEN not configured');
  const response = await fetch(`${merchantHubUrl()}/api/vendors`, {
    method: active ? 'POST' : 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, restaurantId: SPOKE_ID, env: process.env.HATCH_TARGET_ENV === 'dev' ? 'dev' : 'prod' }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Merchant watchlist update failed (${response.status})`);
}

// Archive blocks new orders first; unarchive enables the vendor last. Each
// intermediate step is idempotent, so the operator can retry a partial failure.
export async function PATCH(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(handle)) {
    return NextResponse.json({ error: 'Invalid vendor handle' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (body?.action !== 'archive' && body?.action !== 'unarchive') {
    return NextResponse.json({ error: 'action must be archive or unarchive' }, { status: 400 });
  }
  if (body.action === 'archive' &&
      (body.confirmHandle !== handle || body.acknowledgedNoPaymentInProgress !== true)) {
    return NextResponse.json({ error: 'Confirm the vendor handle and check for payments in progress' }, { status: 400 });
  }
  const active = body.action === 'unarchive';
  const completed: string[] = [];
  try {
    const vendor = await getFarmVendor(handle);
    await transitionVendor(body.action, {
      setFarmActive: (value) => setFarmVendorActive(handle, value),
      setHubActive: (value) => updateHubRegistry(vendor.hive_account, value),
      setWatcherActive: (value) => updateWatchlist(vendor.hive_account, value),
    }, completed);
    console.warn(`[HATCH ARCHIVE] ${handle} (@${vendor.hive_account}) ${body.action}`);
    return NextResponse.json({ success: true, handle, is_active: active });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[HATCH ARCHIVE] ${handle} ${body.action} failed after ${completed.join(', ')}: ${message}`);
    return NextResponse.json({ error: message, completed }, { status: 502 });
  }
}
