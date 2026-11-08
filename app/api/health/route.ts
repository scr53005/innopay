// GET /api/health: "is the hub up?" for spokes, checked just before they send the customer to a
// hub page (Flow 7 top-up, Flow 4/5 account creation). Without it a hub that does not answer left
// the spoke page frozen until the browser gave up with its own error page (indies, 2026-11-07).
// No database, no work: it must answer in milliseconds. Public, read-only, so any origin may call it.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

export function GET() {
  return NextResponse.json({ ok: true }, { headers });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}
