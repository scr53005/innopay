/** QR policy shared by the review screen and the isolated transfer endpoint. */
export type QrErrorCode = 'invalidQr' | 'blockedLink' | 'unsupportedOperation' | 'unsupportedOptions' | 'walletRequired' | 'wrongAccount';
export class QrRequestError extends Error {
  constructor(public readonly code: QrErrorCode) { super(code); }
}
export type QrAsset = 'HIVE' | 'HBD' | 'EURO' | 'LEI';
type NativeTransfer = ['transfer', { from: string; to: string; amount: string; memo: string }];
type TokenTransfer = ['custom_json', { id: string; required_auths: string[]; required_posting_auths: string[]; json: string }];
export type QrTransfer = {
  kind: 'transfer'; from: string; to: string; amount: string; asset: QrAsset; memo: string;
  operation: NativeTransfer | TokenTransfer;
};
export type QrLink = { kind: 'link'; href: string; hostname: string };
export type QrRequest = QrLink | QrTransfer;
function fail(code: QrErrorCode): never { throw new QrRequestError(code); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('unsupportedOperation');
}
function account(value: unknown): string {
  if (typeof value !== 'string' || value.length > 16 || value.length < 3 || !value.split('.').every(part => /^[a-z][a-z0-9-]*[a-z0-9]$/.test(part) && part.length >= 3)) fail('invalidQr');
  return value;
}
function memoText(value: unknown, signer: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') fail('invalidQr');
  const text = value.replaceAll('__signer', signer);
  if (new TextEncoder().encode(text).length > 2048) fail('invalidQr');
  return text;
}
function sender(value: unknown, signer: string): string {
  if (value === undefined || value === '__signer') return signer;
  if (account(value) !== signer) fail('wrongAccount');
  return signer;
}
function quantity(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(value) || !/[1-9]/.test(value)) fail('invalidQr');
  return value;
}
export function approvedQrLink(text: string): QrLink {
  let url: URL;
  try { url = new URL(text); } catch { return fail('blockedLink'); }
  if (!/^https?:\/\//i.test(text) || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || /[\u0000-\u0020\u007f]/.test(text)) fail('blockedLink');
  if (!['innopay.lu', 'offchain.lu'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) fail('blockedLink');
  // Existing printed Indies stickers encode HTTP even when their caption says HTTPS.
  // Validate the original host/credentials/port first, then only expose an HTTPS URL.
  url.protocol = 'https:';
  return { kind: 'link', href: url.href, hostname: url.hostname };
}
function decodeOperation(encoded: string): unknown {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '=');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return fail('invalidQr'); }
}
export function parseQrRequest(raw: string, signer?: string | null): QrRequest {
  if (typeof raw !== 'string' || raw.length > 12000) fail('invalidQr');
  const text = raw.trim();
  if (/^https?:/i.test(text)) return approvedQrLink(text);
  let uri: URL;
  try { uri = new URL(text); } catch { return fail('invalidQr'); }
  const encoded = /^\/op\/([A-Za-z0-9_-]+[.=]{0,2})$/.exec(uri.pathname)?.[1];
  if (uri.protocol !== 'hive:' || uri.hostname !== 'sign' || uri.username || uri.password || uri.port || uri.hash || !encoded) fail('unsupportedOperation');
  // Sign-only and callback semantics must never be silently turned into a broadcast.
  if ([...uri.searchParams.keys()].some(key => key !== 's') || uri.searchParams.getAll('s').length > 1) fail('unsupportedOptions');
  if (!signer) fail('walletRequired');
  account(signer);
  const requestedSigner = uri.searchParams.get('s');
  if (requestedSigner && requestedSigner !== '__signer' && requestedSigner !== signer) fail('wrongAccount');
  const operation = decodeOperation(encoded);
  if (!Array.isArray(operation) || operation.length !== 2 || !record(operation[1])) fail('invalidQr');
  const [type, body] = operation as [unknown, Record<string, unknown>];
  if (type === 'transfer') {
    keys(body, ['from', 'to', 'amount', 'memo']);
    const from = sender(body.from, signer);
    const to = account(body.to === '__signer' ? signer : body.to);
    const match = typeof body.amount === 'string' && /^(\d+\.\d{3}) (HIVE|HBD)$/.exec(body.amount);
    if (!match) fail('unsupportedOperation');
    const amount = quantity(match[1]);
    const asset = match[2] as 'HIVE' | 'HBD';
    const memo = memoText(body.memo, signer);
    return { kind: 'transfer', from, to, amount, asset, memo, operation: ['transfer', { from, to, amount: `${amount} ${asset}`, memo }] };
  }
  if (type !== 'custom_json') return fail('unsupportedOperation');
  keys(body, ['id', 'required_auths', 'required_posting_auths', 'json']);
  if (body.id !== 'ssc-mainnet-hive' || !Array.isArray(body.required_auths) || body.required_auths.length !== 1 || !Array.isArray(body.required_posting_auths) || body.required_posting_auths.length !== 0 || typeof body.json !== 'string') fail('unsupportedOperation');
  const from = sender(body.required_auths[0], signer);
  let contract: unknown;
  try { contract = JSON.parse(body.json); } catch { return fail('invalidQr'); }
  if (!record(contract)) fail('unsupportedOperation');
  keys(contract, ['contractName', 'contractAction', 'contractPayload']);
  if (contract.contractName !== 'tokens' || contract.contractAction !== 'transfer' || !record(contract.contractPayload)) fail('unsupportedOperation');
  const payload = contract.contractPayload;
  keys(payload, ['symbol', 'to', 'quantity', 'memo']);
  if (payload.symbol !== 'EURO' && payload.symbol !== 'LEI') fail('unsupportedOperation');
  const asset = payload.symbol;
  const to = account(payload.to === '__signer' ? signer : payload.to);
  const amount = quantity(payload.quantity);
  const memo = memoText(payload.memo, signer);
  return { kind: 'transfer', from, to, amount, asset, memo, operation: ['custom_json', {
    id: 'ssc-mainnet-hive', required_auths: [from], required_posting_auths: [],
    json: JSON.stringify({ contractName: 'tokens', contractAction: 'transfer', contractPayload: { symbol: asset, to, quantity: amount, memo } }),
  }] };
}
