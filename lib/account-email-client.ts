// Browser side of POST /api/account/email: sign an 'account-email' proof with the wallet's
// active key and ask for the account's own email.
//
// Never throws. null = "unknown" (no or unusable key, network or server trouble), so callers
// keep whatever they display today, exactly as with the old unauthenticated GET.

import { newAccountProofNonce, signAccountProof } from './account-proof';

export type AccountEmailLookup = { found: boolean; email?: string };

export async function fetchOwnAccountEmail(
  account: string,
  activeKeyWif: string | null | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<AccountEmailLookup | null> {
  if (!account || !activeKeyWif) return null;
  try {
    const fields = { purpose: 'account-email' as const, account, payload: '', ts: Date.now(), nonce: newAccountProofNonce() };
    const signature = signAccountProof(fields, activeKeyWif);
    const response = await fetchFn('/api/account/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, ts: fields.ts, nonce: fields.nonce, signature }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data.found !== 'boolean') return null;
    const email = data.found && typeof data.email === 'string' && data.email.trim() ? data.email.trim() : undefined;
    return { found: !!email, email };
  } catch {
    return null;
  }
}
