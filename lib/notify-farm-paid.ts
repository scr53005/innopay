import { farmRequest } from './hatch-vendors';
import { activeSpokeIdForAccount } from './spoke-recipients';

// Fast confirmation for Farm (innohatch) orders, 2026-11-03. After the hub has paid a vendor,
// the customer's screen used to wait for the CHAIN path: Hive block → HAF → merchant-hub poll
// → till sync (6 s) → customer poll (3 s) — ~8–12 s of waiting AFTER the money moved. The hub
// is the payer, so it tells innohatch directly (server-to-server, Bearer PROVISION_SECRET):
// innohatch flips the order to paid at once; the chain sync later links the on-chain transfer
// (reconciliation, not confirmation). Soft-fail: on any error the chain path still confirms.
export async function notifyFarmOrderPaid(p: {
  recipient: string;
  memo: string; // the memo innopay sent to the vendor (contains the order's -inno- suffix)
  amountEur: number;
  innopayTxId: string;
  customerAccount?: string; // absent for guest checkout (Flow 3)
}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await farmRequest('/api/orders/hub-paid', {
      method: 'POST',
      body: JSON.stringify(p),
      signal: controller.signal,
    });
    if (!res.ok) console.warn(`[FARM NOTIFY] innohatch refused hub-paid (${res.status}) for ${p.recipient}`);
  } catch (e) {
    console.warn('[FARM NOTIFY] innohatch unreachable, chain path will confirm:', e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * For callers that don't already know the recipient's spoke (the Stripe webhook: Flow 3 guest,
 * Flow 5, Flow 7): notify innohatch only when the recipient is a Farm vendor. Never throws.
 */
export async function notifyIfFarmVendor(p: {
  recipient: string;
  memo: string;
  amountEur: number;
  innopayTxId: string;
  customerAccount?: string; // absent for guest checkout
}): Promise<void> {
  try {
    if ((await activeSpokeIdForAccount(p.recipient)) !== 'innohatch') return;
    await notifyFarmOrderPaid(p);
  } catch (e) {
    console.warn('[FARM NOTIFY] skipped:', e instanceof Error ? e.message : e);
  }
}
