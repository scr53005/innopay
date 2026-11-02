// Flow 6 leg-2 guard WITHOUT a chain lookup (2026-11-03). The Hive-Engine wait added in the
// 2026-11-02 security fix made Flow 6 take ~33 s. Instead: /api/sign-and-broadcast writes a
// receipt row the moment IT broadcasts a customer → innopay transfer, and /api/wallet-payment
// only accepts a leg 1 for which such a receipt exists. Only the hub can write receipts, so a
// forged / random / someone-else's tx id has none. Whether Hive-Engine actually executed the
// transfer (enough balance) is checked before signing (balance pre-check) and audited again
// after the response (verify-customer-leg.ts) — off the customer's critical path.

/** Receipts older than this cannot pay a new order (the normal leg1→leg2 gap is seconds). */
export const RECEIPT_MAX_AGE_MS = 30 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.0005;

export interface LegReceipt {
  customer_account: string;
  token_symbol: string;
  quantity: number | string | { toString(): string };
  memo: string | null;
  status: string;
  created_at: Date;
}

export interface ExpectedLeg {
  customerAccount: string;
  tokenSymbol: string;
  amount: number;
  distriateSuffix: string;
}

export type ReceiptCheck = { ok: true } | { ok: false; reason: string };

export function checkReceipt(r: LegReceipt | null, e: ExpectedLeg, now: number = Date.now()): ReceiptCheck {
  if (!r) return { ok: false, reason: 'no hub receipt for this transaction' };
  if (r.status !== 'broadcast' && r.status !== 'failed') return { ok: false, reason: `payment already ${r.status}` };
  if (r.customer_account !== e.customerAccount) return { ok: false, reason: 'transaction not sent by the customer' };
  if (r.token_symbol !== e.tokenSymbol) return { ok: false, reason: 'wrong token' };
  const q = Number(String(r.quantity));
  if (!Number.isFinite(q) || q + AMOUNT_TOLERANCE < e.amount) return { ok: false, reason: `paid ${q}, order needs ${e.amount}` };
  if (!r.memo || !r.memo.includes(e.distriateSuffix)) return { ok: false, reason: 'transfer memo does not reference this order' };
  if (now - r.created_at.getTime() > RECEIPT_MAX_AGE_MS) return { ok: false, reason: 'customer payment is too old' };
  return { ok: true };
}

const HE_CONTRACTS = ['https://api.hive-engine.com/rpc/contracts', 'https://engine.rishipanthee.com/contracts'];

/**
 * One fast Hive-Engine balance read (no waiting for blocks). Returns null when the API is
 * unreachable — the caller fails OPEN (UX first); the post-response audit still catches an
 * unfunded transfer.
 */
export async function fetchTokenBalance(account: string, symbol: string, timeoutMs = 2500): Promise<number | null> {
  for (const url of HE_CONTRACTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'findOne', params: { contract: 'tokens', table: 'balances', query: { account, symbol } } }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      return data?.result ? Number(data.result.balance) : 0;
    } catch {
      // next endpoint
    }
  }
  return null;
}
