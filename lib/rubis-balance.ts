// RUBIS shown in the hub's MiniWallet (RUBIS-PLAN.md §5). The spokes already draw the gold RUBIS
// strip; the hub fetched EURO only, so the same customer saw RUBIS on indies but not on the hub.
// Display only: no hub payment decision reads this value.

const HIVE_ENGINE_RPC = 'https://api.hive-engine.com/rpc/contracts';
/** Hub-only key (the spokes store a bare number under innopay_lastRubis; different format). */
export const RUBIS_CACHE_KEY = 'innopay_hub_lastRubis';

/**
 * Hive-Engine `tokens.balances` rows → RUBIS held. No row = 0 (never received any).
 * Anything malformed = null ("unknown"): the MiniWallet then draws no strip rather than a wrong 0.
 */
export function parseRubisRows(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => r && typeof r === 'object' && (r as { symbol?: unknown }).symbol === 'RUBIS');
  if (!row) return 0;
  const value = Number((row as { balance?: unknown }).balance);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchRubisBalance(
  accountName: string,
  fetchImpl: typeof fetch = fetch, // injectable for tests
): Promise<number | null> {
  try {
    const response = await fetchImpl(HIVE_ENGINE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'find',
        params: { contract: 'tokens', table: 'balances', query: { account: accountName, symbol: 'RUBIS' } },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return parseRubisRows(data?.result);
  } catch {
    return null;
  }
}

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

// Stored with the account name: the hub can switch accounts, and one account's RUBIS must never
// flash on another's wallet.
export function readCachedRubis(storage: Reader, accountName: string): number | null {
  try {
    const raw = storage.getItem(RUBIS_CACHE_KEY);
    if (raw === null) return null;
    const cached = JSON.parse(raw) as { accountName?: unknown; rubis?: unknown };
    const value = Number(cached?.rubis);
    return cached?.accountName === accountName && Number.isFinite(value) && value >= 0 ? value : null;
  } catch { return null; }
}

export function saveCachedRubis(storage: Writer, accountName: string, rubis: number): void {
  try { storage.setItem(RUBIS_CACHE_KEY, JSON.stringify({ accountName, rubis })); } catch { /* cache only */ }
}
