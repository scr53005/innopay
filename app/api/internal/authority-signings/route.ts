import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/internal/authority-signings?days=30  (authenticated, LIMAN_API_KEY)
 *
 * Customer payments that /api/sign-and-broadcast signed with @innopay's own key in the last
 * `days` days (1–365, default 30), newest first, plus the most recent one ever. Liman
 * aggregates them on the Books page to judge when the no-key fallback can be retired.
 */
const MAX_ROWS = 5000;

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  return !!key && auth === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requested = Number(req.nextUrl.searchParams.get('days') ?? 30);
  const days = Number.isInteger(requested) && requested >= 1 && requested <= 365 ? requested : 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const [rows, latest] = await Promise.all([
    prisma.innopay_authority_signing.findMany({
      where: { created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      take: MAX_ROWS + 1,
      select: { signer: true, mode: true, symbol: true, quantity: true, to_account: true, tx_id: true, created_at: true },
    }),
    prisma.innopay_authority_signing.findFirst({ orderBy: { created_at: 'desc' }, select: { created_at: true } }),
  ]);

  return NextResponse.json({
    days,
    since: since.toISOString(),
    truncated: rows.length > MAX_ROWS,
    last_ever_at: latest?.created_at.toISOString() ?? null,
    signings: rows.slice(0, MAX_ROWS).map((row) => ({
      signer: row.signer,
      mode: row.mode,
      symbol: row.symbol,
      quantity: row.quantity.toString(),
      to_account: row.to_account,
      tx_id: row.tx_id,
      created_at: row.created_at.toISOString(),
    })),
  });
}
