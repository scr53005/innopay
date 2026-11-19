// Server half of lib/account-proof.ts: freshness, single-use nonce, on-chain key check.
// The nonce goes into the replay-guard table shared with the wallet hand-off and the signed
// Flow 5 order (handoff_challenge), in its own namespace: `proof:<purpose>:<nonce>`.

import { Client } from '@hiveio/dhive';
import prisma from './prisma';
import { validateHiveAccountName } from './hive-account-name';
import { isAccountProofFresh, verifyAccountProof, type AccountProofFields } from './account-proof';

const hiveClient = new Client(['https://api.hive.blog', 'https://api.syncad.com', 'https://api.openhive.network']);

export type AccountProofCheck = { ok: true } | { ok: false; status: number; error: string };

export interface AccountProofDeps {
  /** Insert the nonce; must THROW when it already exists (unique violation = replay). */
  claimNonce: (account: string, namespacedNonce: string) => Promise<void>;
  /** The account's on-chain ACTIVE key_auths, or null when the account does not exist. */
  getActiveKeyAuths: (account: string) => Promise<string[] | null>;
}

const defaultDeps: AccountProofDeps = {
  claimNonce: async (account, nonce) => {
    await prisma.handoff_challenge.create({ data: { account, nonce } });
  },
  getActiveKeyAuths: async (account) => {
    const accounts = await hiveClient.database.getAccounts([account]);
    if (!accounts.length) return null;
    return (accounts[0].active?.key_auths ?? []).map((ka) => String(ka[0]));
  },
};

export async function checkAccountProof(
  fields: AccountProofFields,
  signature: string,
  deps: AccountProofDeps = defaultDeps,
): Promise<AccountProofCheck> {
  if (!validateHiveAccountName(fields.account).valid) return { ok: false, status: 400, error: 'invalid_account' };
  if (!signature || !/^[0-9a-f]{8,64}$/i.test(fields.nonce)) return { ok: false, status: 400, error: 'invalid_proof' };
  if (!isAccountProofFresh(fields.ts)) return { ok: false, status: 401, error: 'proof_expired' };

  try {
    await deps.claimNonce(fields.account, `proof:${fields.purpose}:${fields.nonce}`);
  } catch {
    return { ok: false, status: 409, error: 'proof_already_used' };
  }

  let keyAuths: string[] | null;
  try {
    keyAuths = await deps.getActiveKeyAuths(fields.account);
  } catch (error) {
    console.warn('[ACCOUNT PROOF] chain lookup failed', { account: fields.account, name: (error as Error)?.name });
    return { ok: false, status: 503, error: 'chain_unavailable' };
  }
  if (!keyAuths) return { ok: false, status: 404, error: 'account_not_found' };
  if (!verifyAccountProof(fields, signature, keyAuths)) return { ok: false, status: 401, error: 'bad_signature' };
  return { ok: true };
}
