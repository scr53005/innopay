'use server';

// Server Action: verify a secure spoke→hub wallet hand-off and return the wallet's
// active+memo keys (NEVER the master password). This is the SECURE replacement for
// the old getAccountCredentials-by-name import: a caller must present a fresh,
// single-use challenge SIGNED BY THE ACCOUNT'S ACTIVE KEY — mere knowledge of a
// (public) account name is not enough.

import prisma from '@/lib/prisma';
import { Client, PrivateKey } from '@hiveio/dhive';
import { isFresh, verifyHandoffSignature } from '@/lib/handoff';

const hiveClient = new Client(['https://api.hive.blog', 'https://api.syncad.com', 'https://api.openhive.network']);

interface HandoffResult {
  success: boolean;
  accountName?: string;
  activeKey?: string;
  memoKey?: string;
  error?: string;
}

export async function verifyWalletHandoff(input: {
  account: string;
  ts: number;
  nonce: string;
  sig: string;
}): Promise<HandoffResult> {
  const { account, ts, nonce, sig } = input;
  if (!account || !ts || !nonce || !sig) return { success: false, error: 'missing fields' };

  // 1. Freshness (cheap, no DB): reject stale/future challenges.
  if (!isFresh(ts)) return { success: false, error: 'challenge expired' };

  // 2. Single-use: insert the nonce; a unique violation = already used → replay.
  //    (Opportunistically prune old rows so the table stays tiny.)
  try {
    await prisma.handoff_challenge.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    });
    await prisma.handoff_challenge.create({ data: { account, nonce } });
  } catch {
    return { success: false, error: 'challenge already used' };
  }

  // 3. Verify the signature against the account's ON-CHAIN active authority.
  let activeKeyAuths: string[];
  try {
    const accounts = await hiveClient.database.getAccounts([account]);
    if (!accounts.length) return { success: false, error: 'account not found on chain' };
    activeKeyAuths = (accounts[0].active?.key_auths ?? []).map((ka) => String(ka[0]));
  } catch (e) {
    return { success: false, error: `chain lookup failed: ${e instanceof Error ? e.message : 'error'}` };
  }
  if (!verifyHandoffSignature(account, ts, nonce, sig, activeKeyAuths)) {
    return { success: false, error: 'signature does not match the account active key' };
  }

  // 4. Proven. Derive active+memo from the DB master password. Return ONLY those two
  //    (SPOKE-KEY-SECURITY.md §4 — never hand back the master password or owner key).
  const walletUser = await prisma.walletuser.findUnique({ where: { accountName: account } });
  if (!walletUser?.masterPassword) return { success: false, error: 'account not provisioned in DB' };
  const activeKey = PrivateKey.fromLogin(account, walletUser.masterPassword, 'active').toString();
  const memoKey = PrivateKey.fromLogin(account, walletUser.masterPassword, 'memo').toString();

  return { success: true, accountName: account, activeKey, memoKey };
}
