// One page of a customer's history (HUB-USER-FEATURES-PLAN §3): a page of Hive-Engine's
// account history, the shop names from the hub, classified into AccountMovement rows.
//
// Why Hive-Engine's API and not HAFSQL: HAF is Hive layer 1, so it shows the custom_json a
// customer broadcast, not whether Hive-Engine executed it (a transfer refused for lack of funds
// would look real); and "one account, all time" is an unindexed JSON scan on HAF.
// Why no HBD: the HBD @innopay sends alongside EURO is the tokens' collateral, not the
// customer's money. Showing both would count every top-up twice.

import { classifyMovement, type EngineHistoryEntry } from './classify';
import type { AccountMovement, MovementShop } from './movement';
import { orderReference } from '../order-reference';

export const HISTORY_PAGE_SIZE = 50;
const HE_HISTORY = 'https://history.hive-engine.com/accountHistory';
const TIMEOUT_MS = 8_000;

export type HistoryFilter = 'all' | 'RUBIS';

export interface HistoryPage {
  movements: AccountMovement[];
  /** Offset of the next page, or null at the end of the history. */
  nextOffset: number | null;
}

export interface HistoryDeps {
  fetchEngineHistory: (account: string, offset: number, limit: number, symbol?: string) => Promise<EngineHistoryEntry[]>;
  getShopByAccount: () => Promise<Map<string, MovementShop>>;
  /** For THIS customer only: order reference → the account that was paid. */
  getRecipientsByReference: (account: string, references: string[]) => Promise<Map<string, string>>;
}

export async function loadHistoryPage(
  account: string,
  offset: number,
  filter: HistoryFilter,
  deps: HistoryDeps,
): Promise<HistoryPage> {
  const [entries, shopByAccount] = await Promise.all([
    deps.fetchEngineHistory(account, offset, HISTORY_PAGE_SIZE, filter === 'RUBIS' ? 'RUBIS' : undefined),
    deps.getShopByAccount(),
  ]);

  const references = [...new Set(entries
    .filter((e) => e.operation === 'tokens_transfer' && e.from === account)
    .map((e) => orderReference(e.memo))
    .filter((r): r is string => !!r))];
  const recipients = references.length ? await deps.getRecipientsByReference(account, references) : new Map<string, string>();
  const shopByReference = new Map<string, MovementShop>();
  for (const [reference, recipient] of recipients) {
    shopByReference.set(reference, shopByAccount.get(recipient) ?? { name: `@${recipient}` });
  }

  const movements = entries
    .map((e) => classifyMovement(e, account, { shopByAccount, shopByReference }))
    .filter((m): m is AccountMovement => m !== null);
  return {
    movements,
    // A short page is the last one. Ignored entries (other tokens) still advance the offset.
    nextOffset: entries.length < HISTORY_PAGE_SIZE ? null : offset + entries.length,
  };
}

/** Production fetch of history.hive-engine.com (public, newest first). */
export async function fetchEngineHistory(account: string, offset: number, limit: number, symbol?: string): Promise<EngineHistoryEntry[]> {
  const params = new URLSearchParams({ account, limit: String(limit), offset: String(offset) });
  if (symbol) params.set('symbol', symbol);
  const response = await fetch(`${HE_HISTORY}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!response.ok) throw new Error(`hive-engine history: ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}
