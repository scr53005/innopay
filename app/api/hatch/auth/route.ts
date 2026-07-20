// Operator login for the hatch flow (project_hatchery_vendor_hatching, 3c).
//   POST   { password }  → sets the hatch_session cookie on a match
//   DELETE               → logout
// Env: HATCH_ADMIN_PASSWORD (what the operator types) + HATCH_SESSION_SECRET
// (the cookie value; the middleware checks the cookie equals this). Both must
// be set — no dev default, so an unconfigured deploy fails closed.

import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'hatch_session';

export async function POST(request: NextRequest) {
  const password = process.env.HATCH_ADMIN_PASSWORD;
  const secret = process.env.HATCH_SESSION_SECRET;
  if (!password || !secret) {
    return NextResponse.json(
      { error: 'Hatch auth not configured — set HATCH_ADMIN_PASSWORD and HATCH_SESSION_SECRET' },
      { status: 503 },
    );
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || body.password !== password) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
