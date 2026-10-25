import { NextResponse } from 'next/server';
import { farmRequest } from '@/lib/hatch-vendors';

// /api/hatch/* is protected by the existing operator-session middleware.
export async function GET() {
  try {
    const response = await farmRequest('/api/operator/vendors');
    if (!response.ok) throw new Error(`Farm inventory failed (${response.status})`);
    return NextResponse.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
