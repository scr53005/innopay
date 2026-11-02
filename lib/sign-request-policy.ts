// Policy for /api/sign-and-broadcast — the ONLY operation shape the hub will sign.
//
// Why this exists (security fix, 2026-11-02): the route used to sign ANY caller-supplied
// custom_json, and with `useInnopayAuthority` it signed with @innopay's active key. @innopay
// is the issuer of EURO / LEI / RUBIS and an account-auth over every customer and spoke
// account, so an anonymous POST could issue tokens, drain @innopay's token balances, or move
// any account's tokens. The endpoint's real job is narrow: a customer paying an order (or a
// call-waiter fee) in IOU tokens. Everything else is refused.
//
// Pure module (no DB, no network) so it is unit-testable; the route supplies the account sets.

// RUBIS included: future payments may be split (EURO|LEI + HBD + RUBIS). Still only
// customer → innopay / registered spoke, so it can only ever be spending one's own RUBIS.
export const SIGNABLE_TOKENS = ['EURO', 'LEI', 'RUBIS'] as const;
/** Upper bound for a single signed payment, in token units. Orders are cafe/restaurant tickets;
 *  anything above this is not a legitimate spoke payment. */
export const MAX_SIGNABLE_QUANTITY = 1000;

export interface PolicyContext {
  /** Accounts a customer may pay: 'innopay' + active spoke accounts (call-waiter fees go
   *  directly to the restaurant account). */
  allowedRecipients: ReadonlySet<string>;
  /** Accounts that must never be the signer: 'innopay' itself and every spoke/vendor account
   *  (innopay holds authority over them too). */
  protectedSigners: ReadonlySet<string>;
}

export interface ApprovedPayment {
  signer: string;
  symbol: string;
  to: string;
  quantity: string;
  memo: string;
}

export type PolicyResult = { ok: true; payment: ApprovedPayment } | { ok: false; reason: string };

const QUANTITY_RE = /^\d+(\.\d{1,3})?$/;
const PAYLOAD_KEYS = new Set(['symbol', 'to', 'quantity', 'memo']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateSignRequest(
  operation: unknown,
  accountName: string | undefined,
  ctx: PolicyContext,
): PolicyResult {
  if (!isPlainObject(operation)) return { ok: false, reason: 'operation must be an object' };
  if (operation.id !== 'ssc-mainnet-hive') return { ok: false, reason: 'only Hive-Engine operations are signable' };

  const auths = operation.required_auths;
  const postingAuths = operation.required_posting_auths;
  if (!Array.isArray(auths) || auths.length !== 1 || typeof auths[0] !== 'string') {
    return { ok: false, reason: 'exactly one required_auths account expected' };
  }
  if (postingAuths !== undefined && (!Array.isArray(postingAuths) || postingAuths.length !== 0)) {
    return { ok: false, reason: 'required_posting_auths must be empty' };
  }
  const signer = auths[0];
  if (ctx.protectedSigners.has(signer)) return { ok: false, reason: `signer ${signer} is not a customer account` };
  if (accountName !== undefined && accountName !== signer) {
    return { ok: false, reason: 'accountName does not match the operation signer' };
  }

  if (typeof operation.json !== 'string') return { ok: false, reason: 'json must be a string' };
  let body: unknown;
  try {
    body = JSON.parse(operation.json);
  } catch {
    return { ok: false, reason: 'json is not valid JSON' };
  }
  // Hive-Engine also accepts an ARRAY of actions in one custom_json — refuse it, one action only.
  if (!isPlainObject(body)) return { ok: false, reason: 'exactly one Hive-Engine action expected' };
  if (body.contractName !== 'tokens' || body.contractAction !== 'transfer') {
    return { ok: false, reason: 'only tokens.transfer is signable' };
  }
  const payload = body.contractPayload;
  if (!isPlainObject(payload)) return { ok: false, reason: 'contractPayload must be an object' };
  for (const key of Object.keys(payload)) {
    if (!PAYLOAD_KEYS.has(key)) return { ok: false, reason: `unexpected payload field ${key}` };
  }
  const { symbol, to, quantity, memo = '' } = payload;
  if (typeof symbol !== 'string' || !(SIGNABLE_TOKENS as readonly string[]).includes(symbol)) {
    return { ok: false, reason: 'token not signable' };
  }
  if (typeof to !== 'string' || !ctx.allowedRecipients.has(to)) {
    return { ok: false, reason: `recipient ${String(to)} is not innopay or a registered spoke account` };
  }
  if (typeof quantity !== 'string' || !QUANTITY_RE.test(quantity)) {
    return { ok: false, reason: 'quantity must be a decimal string' };
  }
  const q = Number(quantity);
  if (!(q > 0) || q > MAX_SIGNABLE_QUANTITY) return { ok: false, reason: 'quantity out of range' };
  if (typeof memo !== 'string') return { ok: false, reason: 'memo must be a string' };

  return { ok: true, payment: { signer, symbol, to, quantity, memo } };
}
