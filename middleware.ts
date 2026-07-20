import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Operator gate for the vendor-hatching flow ONLY (project_hatchery_vendor_hatching,
// unit 3c). The matcher is scoped to /hatch + /api/hatch, so every
// customer-facing route (/user, /api/checkout, /api/webhooks, …) is
// completely untouched.
//
// Minimal cookie auth, in the spirit of the Tier C kitchen back-ends
// (proxy.ts + admin_session), but hardened: the cookie value is a server
// SECRET (HATCH_SESSION_SECRET), not the literal 'authenticated' the spokes
// use — so it can't be trivially forged from the browser. Fails CLOSED if
// the secret isn't configured. Upgradeable to the hbdfiat signed-RBAC later.

const SESSION_COOKIE = 'hatch_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page and the auth endpoint must always be reachable.
  if (pathname.startsWith('/hatch/login') || pathname.startsWith('/api/hatch/auth')) {
    return NextResponse.next();
  }

  const secret = process.env.HATCH_SESSION_SECRET;
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const authed = Boolean(secret) && cookie === secret;
  if (authed) return NextResponse.next();

  if (pathname.startsWith('/api/hatch')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/hatch/login', request.url);
  loginUrl.searchParams.set('returnUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/hatch/:path*', '/api/hatch/:path*'],
};
