// POST /api/history — one page of the caller's own account history (HUB-USER-FEATURES-PLAN §3).
// Body: { account, ts, nonce, signature, offset?, filter? } — a lib/account-proof.ts proof,
// purpose 'history'.
//
// The token transfers are public on Hive-Engine, but WHICH SHOP a wallet order paid is not:
// on chain the customer pays @innopay, and only the hub's order_payer table links the order to
// the restaurant. So the page is served only to the wallet that proves it holds the key.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkAccountProof } from '@/lib/account-proof-server';
import { fetchEngineHistory, loadHistoryPage, type HistoryDeps } from '@/lib/history/load';
import type { MovementShop } from '@/lib/history/movement';

// Shop names change rarely; one query per instance per 5 minutes is plenty.
const SHOP_CACHE_MS = 5 * 60 * 1000;
let shopCache: { at: number; map: Map<string, MovementShop> } | null = null;

const deps: HistoryDeps = {
  fetchEngineHistory,
  getShopByAccount: async () => {
    if (shopCache && Date.now() - shopCache.at < SHOP_CACHE_MS) return shopCache.map;
    const rows = await prisma.spoke_account.findMany({
      select: { hive_account: true, spoke: { select: { id: true, name: true } } },
    });
    const map = new Map<string, MovementShop>();
    for (const row of rows) map.set(row.hive_account, { id: row.spoke.id, name: row.spoke.name });
    shopCache = { at: Date.now(), map };
    return map;
  },
  getRecipientsByReference: async (account, references) => {
    const rows = await prisma.order_payer.findMany({
      where: { customer_account: account, reference: { in: references } },
      select: { reference: true, recipient: true },
    });
    return new Map(rows.map((r) => [r.reference, r.recipient]));
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const account = typeof body.account === 'string' ? body.account.trim().replace(/^@/, '').toLowerCase() : '';
    const offset = Number(body.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) {
      return NextResponse.json({ error: 'invalid_offset' }, { status: 400 });
    }
    const filter = body.filter === 'RUBIS' ? 'RUBIS' : 'all';

    const proof = await checkAccountProof(
      { purpose: 'history', account, payload: '', ts: Number(body.ts), nonce: String(body.nonce ?? '') },
      String(body.signature ?? ''),
    );
    if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: proof.status });

    try {
      return NextResponse.json(await loadHistoryPage(account, offset, filter, deps));
    } catch (error: any) {
      console.warn('[HISTORY] page failed', { account, offset, name: error?.name, message: error?.message });
      return NextResponse.json({ error: 'history_unavailable' }, { status: 503 });
    }
  } catch (error: any) {
    console.error('[HISTORY] request failed', { name: error?.name, code: error?.code });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
