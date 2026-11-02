// app/api/sign-and-broadcast/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey, Transaction } from '@hiveio/dhive';
import prisma from '@/lib/prisma';
import { validateSignRequest, type PolicyContext } from '@/lib/sign-request-policy';
import { fetchTokenBalance } from '@/lib/leg-receipt';

const client = new Client([
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://hive-api.arcange.eu'
], {
  timeout: 15000,
  failoverThreshold: 3
});

/**
 * POST /api/sign-and-broadcast
 * Signs and broadcasts a Hive operation server-side (has access to Node.js crypto)
 *
 * Body Option 1:
 * - operation: The Hive operation object (e.g., custom_json for EURO transfer)
 * - activePrivateKey: The active private key (WIF format)
 *
 * Body Option 2:
 * - operation: The Hive operation object
 * - masterPassword: The master password
 * - accountName: The account name (to derive key)
 *
 * Body Option 3:
 * - operation: The Hive operation object
 * - useInnopayAuthority: true (uses innopay's active key from environment)
 *
 * Security: Private key/password transmitted over HTTPS, used immediately for signing,
 * and not stored. Used only for this one-time broadcast.
 *
 * Signing policy (2026-11-02 fix): every request — whatever the key source — must be a
 * single customer `tokens.transfer` of EURO/LEI/RUBIS to innopay or a registered spoke account
 * (lib/sign-request-policy.ts). Innopay's own key is used only when the signer is a known
 * customer (walletuser). Before this, any anonymous caller could get arbitrary custom_json
 * signed by @innopay — the EURO/LEI/RUBIS issuer.
 */

function corsJson(body: unknown, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

// Warm-instance cache: the account set changes only when a vendor is hatched/archived.
let policyCache: { ctx: PolicyContext; at: number } | null = null;
const POLICY_CACHE_MS = 60_000;

async function loadPolicyContext(): Promise<PolicyContext> {
  if (policyCache && Date.now() - policyCache.at < POLICY_CACHE_MS) return policyCache.ctx;
  const spokeAccounts = await prisma.spoke_account.findMany({
    where: { active: true },
    select: { hive_account: true },
  });
  const accounts = new Set<string>(['innopay', ...spokeAccounts.map((a) => a.hive_account)]);
  const ctx = { allowedRecipients: accounts, protectedSigners: accounts };
  policyCache = { ctx, at: Date.now() };
  return ctx;
}

/** Innopay's account-auth may only be exercised on behalf of a hub-created customer wallet. */
async function isKnownCustomer(account: string): Promise<boolean> {
  const user = await prisma.walletuser.findUnique({ where: { accountName: account }, select: { id: true } });
  return user !== null;
}
export async function POST(req: NextRequest) {
  try {
    const { operation, activePrivateKey, masterPassword, accountName, useInnopayAuthority } = await req.json();

    console.log('[SIGN-API] Received sign request');

    // Validate required fields
    if (!operation) {
      const errorResponse = NextResponse.json(
        { error: 'Missing required field: operation' },
        { status: 400 }
      );
      errorResponse.headers.set('Access-Control-Allow-Origin', '*');
      errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return errorResponse;
    }

    if (!activePrivateKey && (!masterPassword || !accountName) && !useInnopayAuthority) {
      const errorResponse = NextResponse.json(
        { error: 'Must provide either activePrivateKey OR (masterPassword + accountName) OR useInnopayAuthority' },
        { status: 400 }
      );
      errorResponse.headers.set('Access-Control-Allow-Origin', '*');
      errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return errorResponse;
    }

    const t0 = Date.now();
    // Everything independent runs in parallel (latency fix 2026-11-03): block reference,
    // policy accounts, then customer check + balance pre-check.
    const propsPromise = client.database.getDynamicGlobalProperties();
    const policy = validateSignRequest(operation, accountName, await loadPolicyContext());
    if (!policy.ok) {
      console.warn('[SIGN-API] Refused by signing policy:', policy.reason);
      return corsJson({ error: 'Operation not allowed', reason: policy.reason }, 403);
    }
    const signer = policy.payment.signer;
    const [innopayMaySign, balance, dynamicGlobalProperties] = await Promise.all([
      isKnownCustomer(signer), // whether innopay authority may be used for this signer at all
      fetchTokenBalance(signer, policy.payment.symbol),
      propsPromise,
    ]);
    // Hive accepts a custom_json even when the token balance is short; Hive-Engine then
    // rejects it AFTER the fact. Refuse up front so no order is paid on an unfunded leg 1.
    // null = Hive-Engine API unreachable → fail open (the post-payment audit still checks).
    if (balance !== null && balance + 0.0005 < Number(policy.payment.quantity)) {
      return corsJson({ error: 'Insufficient balance', balance }, 409);
    }
    const headBlockNumber = dynamicGlobalProperties.head_block_number;
    const headBlockId = dynamicGlobalProperties.head_block_id;
    const refBlockNum = headBlockNumber & 0xffff;
    const refBlockPrefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
    const expirationTime = Math.floor(Date.now() / 1000) + 60; // 60-second expiration

    const baseTransaction: Transaction = {
      ref_block_num: refBlockNum,
      ref_block_prefix: refBlockPrefix,
      expiration: new Date(expirationTime * 1000).toISOString().slice(0, -5),
      operations: [['custom_json', operation] as any],
      extensions: [],
    };

    let broadcastResult: any;
    let usedFallback = false;

    // CASCADE APPROACH: Try user's key first, fallback to innopay authority on failure
    if (useInnopayAuthority) {
      // Explicit request to use innopay authority
      if (!innopayMaySign) {
        console.warn('[SIGN-API] Refused innopay authority for non-customer signer:', signer);
        return corsJson({ error: 'Operation not allowed', reason: 'innopay authority unavailable for this account' }, 403);
      }
      // warn level: we count these to decide when the no-key fallback can be retired.
      console.warn('[SIGN-API] Using innopay authority (explicit, no local key) for', signer, policy.payment.symbol, policy.payment.quantity, '->', policy.payment.to);
      const innopayActiveKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
      if (!innopayActiveKey) {
        throw new Error('HIVE_ACTIVE_KEY_INNOPAY not configured in environment');
      }
      const key = PrivateKey.fromString(innopayActiveKey);
      const signedTransaction = client.broadcast.sign(baseTransaction, [key]);
      broadcastResult = await client.broadcast.send(signedTransaction);
      console.log('[SIGN-API] Broadcast successful with innopay authority! TX:', broadcastResult.id);
    } else {
      // Try user's own key first
      let key: PrivateKey;
      let keySource: string;

      if (activePrivateKey) {
        // Option 1: Use provided active key
        console.log('[SIGN-API] Using provided active key...');
        key = PrivateKey.fromString(activePrivateKey);
        keySource = 'provided active key';
      } else {
        // Option 2: Derive active key from master password
        console.log('[SIGN-API] Deriving active key from master password...');
        key = PrivateKey.fromSeed(`${accountName}active${masterPassword}`);
        keySource = 'derived from master password';
      }

      try {
        // Attempt to sign and broadcast with user's key
        console.log('[SIGN-API] Attempting to sign with user key...');
        const signedTransaction = client.broadcast.sign(baseTransaction, [key]);
        broadcastResult = await client.broadcast.send(signedTransaction);
        console.log('[SIGN-API] Broadcast successful with user key! TX:', broadcastResult.id);
      } catch (userKeyError: any) {
        // User's key failed - check if it's an authority error
        const errorMessage = userKeyError.message || '';
        console.warn('[SIGN-API] User key failed:', errorMessage);

        if (errorMessage.includes('Missing Active Authority') ||
            errorMessage.includes('Missing required active authority') ||
            errorMessage.includes('missing authority')) {
          // Authority error - try fallback to innopay authority
          if (!innopayMaySign) throw userKeyError;
          console.warn('[SIGN-API] Falling back to innopay authority (user key rejected) for', signer);

          const innopayActiveKey = process.env.HIVE_ACTIVE_KEY_INNOPAY;
          if (!innopayActiveKey) {
            throw new Error('User key failed and HIVE_ACTIVE_KEY_INNOPAY not configured for fallback');
          }

          const innopayKey = PrivateKey.fromString(innopayActiveKey);
          const signedTransaction = client.broadcast.sign(baseTransaction, [innopayKey]);
          broadcastResult = await client.broadcast.send(signedTransaction);
          usedFallback = true;
          console.log('[SIGN-API] Broadcast successful with innopay authority (fallback)! TX:', broadcastResult.id);
        } else {
          // Other error - rethrow
          throw userKeyError;
        }
      }
    }

    // Hub receipt for Flow 6 / call-waiter leg 1 (customer → innopay): lets /api/wallet-payment
    // trust this tx id without waiting for Hive-Engine (lib/leg-receipt.ts). Must be written
    // before we answer, since the spoke calls wallet-payment right after.
    if (policy.payment.to === 'innopay') {
      await prisma.wallet_payment_claim.create({
        data: {
          customer_tx_id: broadcastResult.id,
          customer_account: signer,
          token_symbol: policy.payment.symbol,
          quantity: Number(policy.payment.quantity),
          memo: policy.payment.memo,
          status: 'broadcast',
        },
      });
    }
    console.warn(`[SIGN-API] done in ${Date.now() - t0} ms (${useInnopayAuthority || usedFallback ? 'innopay authority' : 'user key'})`);

    // Add CORS headers for cross-origin requests from indiesmenu
    const response = NextResponse.json({
      success: true,
      txId: broadcastResult.id,
      usedFallback // Include whether fallback was used
    }, { status: 200 });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;

  } catch (error: any) {
    console.error('[SIGN-API] Error:', error);
    const errorResponse = NextResponse.json(
      {
        error: 'Signing/broadcasting failed',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );

    // Add CORS headers to error response
    errorResponse.headers.set('Access-Control-Allow-Origin', '*');
    errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return errorResponse;
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  const response = NextResponse.json({}, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
