// GET /api/hatch/templates — operator-gated proxy (middleware guards /api/hatch)
// that fetches the vendor category list from innohatch for the hatch dropdown.
// The browser can't hold PROVISION_SECRET, so the hub adds it server-side.

import { NextRequest, NextResponse } from 'next/server';
import { proxyFarmTemplates } from '@/lib/hatch-templates';

export async function GET(request: NextRequest) {
  return proxyFarmTemplates(request.nextUrl.searchParams.get('all') === '1' ? '?all=1' : '');
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  return proxyFarmTemplates('', { method: 'POST', body: JSON.stringify(body) });
}
