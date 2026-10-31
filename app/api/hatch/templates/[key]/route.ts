import { NextRequest, NextResponse } from 'next/server';
import { proxyFarmTemplates } from '@/lib/hatch-templates';

type Context = { params: Promise<{ key: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { key } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  return proxyFarmTemplates(`/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { key } = await params;
  return proxyFarmTemplates(`/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
