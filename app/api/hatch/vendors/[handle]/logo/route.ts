import { NextResponse } from 'next/server';
import { farmRequest } from '@/lib/hatch-vendors';

// The /api/hatch middleware checks the operator cookie before this proxy runs.
export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(handle)) {
    return NextResponse.json({ error: 'Invalid vendor handle' }, { status: 400 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('logo');
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) {
    return NextResponse.json({ error: 'Choose an image under 1 MB.' }, { status: 400 });
  }
  const outbound = new FormData();
  outbound.set('logo', file);
  try {
    const response = await farmRequest(`/api/vendors/${handle}/logo`, { method: 'POST', body: outbound });
    const data = await response.json().catch(() => ({ error: 'Farm logo upload failed' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[HATCH LOGO] ${handle}:`, error);
    return NextResponse.json({ error: 'Farm logo upload unavailable' }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(handle)) {
    return NextResponse.json({ error: 'Invalid vendor handle' }, { status: 400 });
  }
  try {
    const response = await farmRequest(`/api/vendors/${handle}/logo`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({ error: 'Farm logo removal failed' }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[HATCH LOGO] ${handle} remove:`, error);
    return NextResponse.json({ error: 'Farm logo removal unavailable' }, { status: 502 });
  }
}
