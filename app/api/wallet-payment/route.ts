// app/api/wallet-payment/route.ts
import { NextRequest, NextResponse, after } from 'next/server';
import { Client, PrivateKey } from '@hiveio/dhive';
import { transferHbd, transferEuroTokens } from '@/services/hive';
import { getUsdPerFiatServerSide } from '@/services/currency';
import { resolveSpokeCurrency } from '@/lib/spoke-currency';
import prisma from '@/lib/prisma';
import { ArchivedFarmVendorError, assertFarmOrderRecipientActive } from '@/lib/farm-payment-guard';
import { checkCustomerLeg, fetchHeTransaction } from '@/lib/verify-customer-leg';
import { checkReceipt } from '@/lib/leg-receipt';
import { isActiveSpokeAccount } from '@/lib/spoke-recipients';

function corsJson(body: unknown, status: number) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

const client = new Client([
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://hive-api.arcange.eu'
]);

const INNOPAY = 'innopay';

/**
 * POST /api/wallet-payment — Flow 6 leg 2 (and indies call-waiter): innopay pays the restaurant.
 *
 * Critical path (what the customer waits for), latency-tuned 2026-11-03 (was ~33 s):
 *   1. in parallel: recipient is an active spoke account, archived-farm guard, spoke currency,
 *      and the HUB RECEIPT of leg 1 (written by /api/sign-and-broadcast — no chain lookup);
 *   2. claim the receipt atomically (single use);
 *   3. in parallel: rate + innopay's HBD balance;
 *   4. innopay → restaurant transfer (HBD, else IOU token) → respond.
 * After the response (next/server `after`): mark the claim paid, pull the customer's HBD
 * share via innopay authority (+ debt on shortfall), and audit on Hive-Engine that leg 1 really
 * executed (status 'unbacked' + error log if not).
 *
 * Body: customerAccount, customerTxId, recipient, amountEuro, eurUsdRate? (indies passes it;
 * otherwise resolved server-side per fiat), orderMemo, distriateSuffix.
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const lap = (label: string) => console.warn(`[WALLET PAYMENT] ${label} +${Date.now() - t0} ms`);
  try {
    const { customerAccount, customerTxId, recipient, amountEuro, eurUsdRate, orderMemo, distriateSuffix } = await req.json();

    if (!customerAccount || !customerTxId || !recipient || !amountEuro || !orderMemo || !distriateSuffix) {
      return corsJson({ error: 'Missing required fields' }, 400);
    }
    const orderAmount = parseFloat(amountEuro);
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
      return corsJson({ error: 'Invalid amount' }, 400);
    }

    // ── 1. Guards, all in parallel ──
    const [recipientOk, farmGuard, currencyConfig, receipt] = await Promise.all([
      isActiveSpokeAccount(recipient),
      assertFarmOrderRecipientActive(recipient, orderMemo).then(() => null, (e: unknown) => e),
      resolveSpokeCurrency({ account: recipient }),
      prisma.wallet_payment_claim.findUnique({ where: { customer_tx_id: String(customerTxId) } }),
    ]);
    if (farmGuard) {
      if (farmGuard instanceof ArchivedFarmVendorError) return corsJson({ error: 'Farm vendor archived; payment disabled' }, 410);
      throw farmGuard;
    }
    if (!recipientOk) {
      console.warn('[WALLET PAYMENT] Refused: recipient is not an active spoke account:', recipient);
      return corsJson({ error: 'Unknown recipient' }, 403);
    }
    const leg = checkReceipt(receipt, { customerAccount, tokenSymbol: currencyConfig.iouToken, amount: orderAmount, distriateSuffix });
    if (!leg.ok) {
      console.warn('[WALLET PAYMENT] Leg 1 refused:', customerTxId, leg.reason);
      return corsJson({ error: 'Customer payment does not match this order', reason: leg.reason }, 403);
    }

    // ── 2. Claim (single use): only one caller can move broadcast|failed → claimed ──
    const claimed = await prisma.wallet_payment_claim.updateMany({
      where: { customer_tx_id: customerTxId, customer_account: customerAccount, status: { in: ['broadcast', 'failed'] } },
      data: { status: 'claimed', recipient },
    });
    if (claimed.count === 0) {
      console.warn('[WALLET PAYMENT] Replay refused, tx already claimed:', customerTxId);
      return corsJson({ error: 'This payment has already been used' }, 409);
    }
    lap('guards+claim');

    // ── 3. Rate + innopay HBD balance, in parallel ──
    const [usdPerFiat, innopayAccounts] = await Promise.all([
      eurUsdRate
        ? Promise.resolve(parseFloat(eurUsdRate)) // legacy: indiesmenu passes the EUR rate
        : getUsdPerFiatServerSide(currencyConfig.fiat).then((r) => r.conversion_rate),
      client.database.getAccounts([INNOPAY]),
    ]);
    const requiredHbd = orderAmount * usdPerFiat;
    const hbdBalance = parseFloat(String(innopayAccounts[0]?.hbd_balance ?? '0').split(' ')[0]);
    lap('rate+balance');

    // ── 4. innopay → restaurant ──
    const finalMemo = `${orderMemo} ${distriateSuffix}`;
    const paidInHbd = hbdBalance >= requiredHbd;
    let transferTxId: string;
    try {
      transferTxId = paidInHbd
        ? await transferHbd(recipient, requiredHbd, finalMemo)
        : await transferEuroTokens(recipient, orderAmount, finalMemo, currencyConfig.iouToken);
    } catch (payError) {
      await prisma.wallet_payment_claim.update({ where: { customer_tx_id: customerTxId }, data: { status: 'failed' } })
        .catch((e) => console.error('[WALLET PAYMENT] Could not mark claim failed:', e));
      throw payError;
    }
    lap(`restaurant paid in ${paidInHbd ? 'HBD' : currencyConfig.iouToken}`);

    // ── After the response: bookkeeping, customer HBD share, on-chain audit ──
    after(async () => {
      await prisma.wallet_payment_claim.update({
        where: { customer_tx_id: customerTxId },
        data: { status: 'paid', restaurant_tx_id: transferTxId },
      }).catch((e) => console.error('[WALLET PAYMENT] Could not mark claim paid:', e));
      await collectCustomerHbd(customerAccount, requiredHbd, orderAmount, usdPerFiat, currencyConfig, customerTxId);
      await auditCustomerLeg(customerTxId, customerAccount, currencyConfig.iouToken, orderAmount, distriateSuffix);
    });

    return corsJson({
      success: true,
      customerEuroTxId: customerTxId,
      innopayTxId: transferTxId,
      recipient,
      distriateSuffix,
      innopayTransferType: paidInHbd ? 'HBD' : currencyConfig.iouToken,
    }, 200);
  } catch (error: any) {
    console.error('[WALLET PAYMENT] Error:', error);
    return corsJson({
      error: 'Payment processing failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, 500);
  }
}

/**
 * The customer's HBD share of the order, pulled with innopay's authority (unchanged logic,
 * moved off the critical path 2026-11-03). Shortfall → outstanding_debt customer → innopay.
 */
async function collectCustomerHbd(
  customerAccount: string,
  requiredHbd: number,
  orderAmount: number,
  usdPerFiat: number,
  currencyConfig: { fiat: string; iouToken: string },
  customerTxId: string,
) {
  let transferred = 0;
  try {
    const accounts = await client.database.getAccounts([customerAccount]);
    if (!accounts.length) throw new Error(`Customer account ${customerAccount} not found`);
    const liquid = parseFloat(String(accounts[0].hbd_balance).split(' ')[0]);
    if (liquid > 0) {
      const key = process.env.HIVE_ACTIVE_KEY_INNOPAY;
      if (!key) throw new Error('HIVE_ACTIVE_KEY_INNOPAY not configured');
      const amount = Math.min(liquid, requiredHbd);
      await client.broadcast.sendOperations([[
        'transfer',
        { from: customerAccount, to: INNOPAY, amount: `${amount.toFixed(3)} HBD`, memo: `Order payment: ${orderAmount} ${currencyConfig.fiat}` },
      ] as any], PrivateKey.fromString(key));
      transferred = amount;
    }
  } catch (e: any) {
    console.error('[WALLET PAYMENT] Customer HBD pull failed:', e?.message);
  }
  const shortfall = requiredHbd - transferred;
  if (shortfall > 0.001) {
    await prisma.outstanding_debt.create({
      data: {
        creditor: INNOPAY,
        debtor: customerAccount,
        amount_hbd: shortfall,
        original_amount: shortfall,
        amount_euro: Math.round((shortfall / usdPerFiat) * 100) / 100,
        fiat_currency: currencyConfig.fiat,
        token_symbol: currencyConfig.iouToken,
        euro_tx_id: customerTxId,
        eur_usd_rate: usdPerFiat,
        reason: 'customer_order_payment',
        notes: `Customer ${customerAccount} could not transfer ${shortfall} HBD for order. Transferred ${transferred} HBD. ${currencyConfig.iouToken} transfer: ${customerTxId}`,
      },
    }).catch((e) => console.error('[WALLET PAYMENT] Failed to record customer debt:', e));
  }
}

/** Post-response proof that Hive-Engine executed leg 1 (the balance pre-check can race). */
async function auditCustomerLeg(customerTxId: string, customerAccount: string, tokenSymbol: string, amount: number, distriateSuffix: string) {
  try {
    const [tx, props] = await Promise.all([fetchHeTransaction(customerTxId, 15, 3000), client.database.getDynamicGlobalProperties()]);
    const check = tx
      ? checkCustomerLeg(tx, { customerAccount, tokenSymbol, amount, distriateSuffix, headHiveBlock: props.head_block_number })
      : { ok: false as const, reason: 'not found on Hive-Engine after ~45 s' };
    if (!check.ok) {
      console.error(`[WALLET PAYMENT] 🚨 UNBACKED leg 1 ${customerTxId} (${customerAccount}): ${check.reason} — restaurant was paid`);
      await prisma.wallet_payment_claim.update({ where: { customer_tx_id: customerTxId }, data: { status: 'unbacked' } });
    }
  } catch (e) {
    console.error('[WALLET PAYMENT] Leg 1 audit failed to run:', e);
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return corsJson({}, 200);
}
