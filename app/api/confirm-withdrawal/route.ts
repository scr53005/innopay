import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/confirm-withdrawal  (public — called by the confirm page)
 *
 * Relays the owner's click to Liman's authenticated confirm callback. Innopay
 * does not touch Liman's DB; it only forwards the opaque token. The token
 * itself is the per-withdrawal secret (it came from the email link), and the
 * server-to-server call is authenticated with the shared LIMAN_API_KEY.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const limanUrl = process.env.LIMAN_URL;
  const limanApiKey = process.env.LIMAN_API_KEY;
  if (!limanUrl || !limanApiKey) {
    console.error('[CONFIRM-WITHDRAWAL] LIMAN_URL or LIMAN_API_KEY not configured');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${limanUrl}/api/internal/withdrawal-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${limanApiKey}` },
      body: JSON.stringify({ token: body.token }),
    });
  } catch (e) {
    console.error('[CONFIRM-WITHDRAWAL] Liman call failed:', e);
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 });
  }

  // Relay Liman's status verbatim (200 ok, 404 not_found, 410 expired, 409 not_ready).
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
