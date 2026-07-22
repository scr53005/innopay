// GET /api/hatch/templates — operator-gated proxy (middleware guards /api/hatch)
// that fetches the vendor category list from innohatch for the hatch dropdown.
// The browser can't hold PROVISION_SECRET, so the hub adds it server-side.

import { NextResponse } from 'next/server';

function innohatchUrl() {
  return (process.env.INNOHATCH_URL || 'https://innohatch.vercel.app').replace(/\/$/, '');
}

export async function GET() {
  const secret = process.env.PROVISION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'PROVISION_SECRET not configured' }, { status: 503 });
  }
  try {
    const res = await fetch(`${innohatchUrl()}/api/templates`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `innohatch templates failed (${res.status})`, templates: [] }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, templates: [] }, { status: 502 });
  }
}
