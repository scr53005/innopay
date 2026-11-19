// Hive-Engine history entry → AccountMovement (HUB-USER-FEATURES-PLAN §3). Pure.
//
// The memos it recognizes are written elsewhere; keep them in step:
// - 'Bienvenue dans le système Innopay! / Welcome to Innopay!' and
//   'Solde mis à jour! / Balance updated!' — app/api/webhooks/route.ts, top-ups;
// - 'Monnaie / Change' — the webhook, change after a card-paid order;
// - 'RUBIS · merci ! — <shop name>' — lib/rubis-distribute.ts;
// - '<tag>-inno-<r4>-<r4>' order reference — the spokes (lib/order-reference.ts);
// - 'photo:<id>' — indiesmenu lib/photos/review.ts rewardMemo;
// - 'm1:…' and 'msg-reward:…' — the shop messages (§4, not built yet).

import type { AccountMovement, MovementShop } from './movement';
import { orderReference } from '../order-reference';

/** The tokens a customer's wallet holds. Anything else in the account's history is ignored. */
export const HISTORY_SYMBOLS = ['EURO', 'LEI', 'RUBIS'] as const;
const INNOPAY = 'innopay';

/** One entry of history.hive-engine.com/accountHistory (only the fields used). */
export interface EngineHistoryEntry {
  operation: string;
  from?: string;
  to?: string;
  symbol?: string;
  quantity?: string;
  memo?: string | null;
  timestamp: number; // seconds
  transactionId: string;
}

export interface ClassifyContext {
  /** Hive account → the shop it belongs to (hub spoke_account + spoke). */
  shopByAccount: Map<string, MovementShop>;
  /** Order reference → the shop that was paid (hub order_payer, for this customer only). */
  shopByReference: Map<string, MovementShop>;
}

const RUBIS_THANKS = /^RUBIS · merci ! — (.+)$/;

export function classifyMovement(entry: EngineHistoryEntry, account: string, ctx: ClassifyContext): AccountMovement | null {
  if (entry.operation !== 'tokens_transfer') return null;
  const symbol = entry.symbol ?? '';
  if (!(HISTORY_SYMBOLS as readonly string[]).includes(symbol)) return null;
  const from = entry.from ?? '';
  const to = entry.to ?? '';
  const incoming = to === account;
  if (!incoming && from !== account) return null;
  if (incoming && from === account) return null; // self-transfer: no net movement
  const quantity = Number(entry.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const memo = (entry.memo ?? '').trim();
  const counterparty = incoming ? from : to;
  const ref = orderReference(memo) ?? undefined;
  const base = {
    account,
    at: new Date(entry.timestamp * 1000).toISOString(),
    symbol,
    amount: incoming ? quantity : -quantity,
    counterparty,
    source: 'hive-engine' as const,
    tx_id: entry.transactionId,
  };
  const counterpartyShop = ctx.shopByAccount.get(counterparty);

  if (incoming) {
    if (counterparty === INNOPAY) {
      const thanks = symbol === 'RUBIS' ? RUBIS_THANKS.exec(memo) : null;
      if (thanks) return { ...base, kind: 'rubis_earned', shop: { name: thanks[1].trim() } };
      if (memo === 'Monnaie / Change') return { ...base, kind: 'change' };
      if (symbol !== 'RUBIS' && (/Welcome to Innopay/i.test(memo) || /Balance updated/i.test(memo))) {
        return { ...base, kind: 'topup' };
      }
    }
    if (/^photo:\d+$/.test(memo)) return { ...base, kind: 'photo_reward', shop: counterpartyShop };
    if (memo.startsWith('msg-reward:')) return { ...base, kind: 'message_reward', shop: counterpartyShop };
    return { ...base, kind: 'transfer_in', shop: counterpartyShop };
  }

  if (memo.startsWith('m1:')) return { ...base, kind: 'message', shop: counterpartyShop };
  if (ref) {
    // A wallet order goes to @innopay, which pays the shop; only the hub's order_payer row
    // knows which shop. A direct payment (or the RUBIS leg) goes to the shop itself.
    const shop = counterparty === INNOPAY ? ctx.shopByReference.get(ref) : counterpartyShop ?? ctx.shopByReference.get(ref);
    return { ...base, kind: symbol === 'RUBIS' ? 'rubis_spent' : 'order', shop, ref };
  }
  return { ...base, kind: 'transfer_out', shop: counterpartyShop };
}

/** RUBIS earned vs spent over a set of movements (rewards count as earned). */
export function rubisTotals(movements: AccountMovement[]): { earned: number; spent: number } {
  let earned = 0;
  let spent = 0;
  for (const m of movements) {
    if (m.symbol !== 'RUBIS') continue;
    if (m.amount > 0) earned += m.amount; else spent -= m.amount;
  }
  // Sums of 2-decimal amounts drift in binary floating point.
  return { earned: Math.round(earned * 100) / 100, spent: Math.round(spent * 100) / 100 };
}
