// Flow 6 leg-2 guard (security fix 2026-11-02): /api/wallet-payment pays a restaurant from
// innopay's funds ONLY after proving, on Hive-Engine, that the customer really sent the
// matching IOU tokens to innopay (leg 1). Before this the route trusted the `customerTxId`
// in the request body without looking it up, so any caller could get a restaurant paid —
// i.e. order food on innopay's money, or on a victim's (the route also pulls HBD from the
// named customer account via innopay's authority).
//
// What counts as proof is the EXECUTED transfer event in the sidechain logs — not the
// requested payload: a custom_json can land on Hive yet be rejected by Hive-Engine
// (e.g. overdrawn balance). Pure check + small network fetcher; the check is unit-tested.

export interface HeTransactionInfo {
  transactionId?: string;
  refHiveBlockNumber?: number;
  sender?: string;
  contract?: string;
  action?: string;
  payload?: string; // JSON string
  logs?: string; // JSON string: { events: [...] } or { errors: [...] }
}

export interface ExpectedCustomerLeg {
  customerAccount: string;
  tokenSymbol: string; // EURO | LEI
  amount: number; // fiat units, the order amount
  distriateSuffix: string; // must appear in the transfer memo → ties leg 1 to THIS order
  headHiveBlock: number; // current Hive head block, for the freshness bound
}

/** Leg 1 must be recent. Every past customer→innopay transfer is public on chain; without a
 *  freshness bound an attacker could replay old ones (each once — the claim table blocks
 *  re-use — but there are thousands of them from before the claim table existed).
 *  600 blocks × 3s = 30 min, far above the normal leg1→leg2 gap of a few seconds. */
export const MAX_LEG_AGE_BLOCKS = 600;

export type LegCheck = { ok: true; quantity: number } | { ok: false; reason: string };

const AMOUNT_TOLERANCE = 0.0005;

function parseJson(s: unknown): unknown {
  if (typeof s !== 'string') return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export function checkCustomerLeg(tx: HeTransactionInfo, expected: ExpectedCustomerLeg): LegCheck {
  const ref = Number(tx.refHiveBlockNumber);
  if (!Number.isFinite(ref) || expected.headHiveBlock - ref > MAX_LEG_AGE_BLOCKS) {
    return { ok: false, reason: 'customer payment is too old to be used for a new order' };
  }
  if (tx.sender !== expected.customerAccount) return { ok: false, reason: 'transaction not sent by the customer' };
  if (tx.contract !== 'tokens' || tx.action !== 'transfer') return { ok: false, reason: 'not a token transfer' };

  const logs = parseJson(tx.logs) as { errors?: unknown[]; events?: unknown[] } | undefined;
  if (!logs) return { ok: false, reason: 'transaction logs unreadable' };
  if (Array.isArray(logs.errors) && logs.errors.length > 0) {
    return { ok: false, reason: `transfer rejected by Hive-Engine: ${String(logs.errors[0])}` };
  }
  const events = Array.isArray(logs.events) ? logs.events : [];
  const transfer = events.find((e) => {
    const ev = e as { contract?: string; event?: string; data?: Record<string, unknown> };
    return ev.contract === 'tokens' && ev.event === 'transfer' && ev.data?.from === expected.customerAccount
      && ev.data?.to === 'innopay' && ev.data?.symbol === expected.tokenSymbol;
  }) as { data: { quantity?: unknown } } | undefined;
  if (!transfer) return { ok: false, reason: `no executed ${expected.tokenSymbol} transfer to innopay` };

  const quantity = Number(transfer.data.quantity);
  if (!Number.isFinite(quantity) || quantity + AMOUNT_TOLERANCE < expected.amount) {
    return { ok: false, reason: `transferred ${String(transfer.data.quantity)}, order needs ${expected.amount}` };
  }

  const payload = parseJson(tx.payload) as { memo?: unknown } | undefined;
  if (typeof payload?.memo !== 'string' || !payload.memo.includes(expected.distriateSuffix)) {
    return { ok: false, reason: 'transfer memo does not reference this order' };
  }
  return { ok: true, quantity };
}

const HE_BLOCKCHAIN_ENDPOINTS = [
  'https://api.hive-engine.com/rpc/blockchain',
  'https://engine.rishipanthee.com/blockchain',
  'https://herpc.dtools.dev/blockchain',
];

async function fetchOnce(txId: string): Promise<HeTransactionInfo | null> {
  for (const endpoint of HE_BLOCKCHAIN_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransactionInfo', params: { txid: txId } }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      return (data?.result as HeTransactionInfo | null) ?? null; // null = not processed (yet)
    } catch {
      // try next endpoint
    }
  }
  return null;
}

/**
 * Hive-Engine processes a Hive block a few seconds after it is produced, so a leg-1 tx
 * broadcast moments ago is usually not visible yet. Poll for up to ~24s.
 */
export async function fetchHeTransaction(txId: string, attempts = 12, delayMs = 2000): Promise<HeTransactionInfo | null> {
  for (let i = 0; i < attempts; i++) {
    const tx = await fetchOnce(txId);
    if (tx) return tx;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
