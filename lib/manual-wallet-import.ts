import { PrivateKey } from '@hiveio/dhive';
import { validateHiveAccountName } from './hive-account-name';
import type { WalletImport } from './wallet-import';

export function normalizeImportAccountName(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export interface HiveImportAccount {
  name: string;
  memo_key: string;
  active: { weight_threshold: number; key_auths: [string, number][] };
}

function publicKey(wif: string, role: string): string {
  try { return PrivateKey.fromString(wif.trim()).createPublic().toString(); }
  catch { throw new Error(`Enter a valid ${role} private key (WIF).`); }
}

/** Validate locally. Never pass private keys to an RPC, API, URL or log. */
export function validateManualWallet(
  accountName: string, active: string, memo: string, account: HiveImportAccount | null,
  requiredAccountName?: string,
): WalletImport {
  const name = normalizeImportAccountName(accountName);
  const validation = validateHiveAccountName(name);
  if (!validation.valid) throw new Error(validation.message);
  if (requiredAccountName && name !== requiredAccountName) throw new Error(`Import @${requiredAccountName} for this vendor.`);
  const activePublic = publicKey(active, 'active');
  const memoPublic = publicKey(memo, 'memo');
  if (!account || account.name !== name) throw new Error(`@${name} was not found on Hive.`);
  const weight = account.active.key_auths.find(([key]) => key === activePublic)?.[1] ?? 0;
  if (weight <= 0 || weight < account.active.weight_threshold) {
    throw new Error('The active key cannot authorize payments for this account. Check the account name and key.');
  }
  if (memoPublic !== account.memo_key) throw new Error('The memo key does not match this account.');
  return { accountName: name, keys: { active: active.trim(), memo: memo.trim() } };
}

export async function importManualWallet(
  accountName: string, active: string, memo: string, requiredAccountName?: string,
): Promise<WalletImport> {
  const name = normalizeImportAccountName(accountName);
  const validation = validateHiveAccountName(name);
  if (!validation.valid) throw new Error(validation.message);
  if (requiredAccountName && name !== requiredAccountName) throw new Error(`Import @${requiredAccountName} for this vendor.`);
  // Reject malformed keys before making any network request.
  publicKey(active, 'active');
  publicKey(memo, 'memo');
  let accounts: HiveImportAccount[] | undefined;
  for (const node of ['https://api.hive.blog', 'https://api.syncad.com', 'https://api.openhive.network']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(node, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [[name]], id: 1 }),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data.result)) { accounts = data.result; break; }
    } catch { /* Try the next public node; never log input or key parsing errors. */ }
    finally { clearTimeout(timeout); }
  }
  if (!accounts) throw new Error('Could not check this account on Hive. Please try again.');
  return validateManualWallet(name, active, memo, accounts[0] ?? null, requiredAccountName);
}
