// GET /api/orders/payer?account=<customer>&recipient=<restaurant>&since=<ISO date>
// The orders this customer paid to this restaurant since that date (at most 3 h back), for the
// spoke's customer photos (DISH-PHOTOS-PLAN.md §4): a wallet order reaches the restaurant from
// @innopay, so the spoke matches these references against its own transfers' memos.
// Read-only and server-to-server. It reveals no more than the chain already does (Flow 6's
// customer leg carries the same reference in its memo).

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { clampSince } from '@/lib/order-reference';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const account = params.get('account');
  const recipient = params.get('recipient');
  const since = clampSince(params.get('since'), Date.now());
  if (!account || !recipient || !since) {
    return NextResponse.json({ error: 'account, recipient and since are required' }, { status: 400 });
  }
  try {
    const rows = await prisma.order_payer.findMany({
      where: { customer_account: account, recipient, created_at: { gte: since } },
      select: { reference: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return NextResponse.json({
      orders: rows.map((r) => ({ reference: r.reference, paidAt: r.created_at.toISOString() })),
    });
  } catch (error) {
    console.error('[ORDERS PAYER]', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
