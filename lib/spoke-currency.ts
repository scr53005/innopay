// lib/spoke-currency.ts
// Resolve a spoke's CurrencyConfig (fiat + IOU token) authoritatively from the DB at
// checkout-session creation. The resolved fiat sets the Stripe charge currency and is
// stamped into the Stripe session metadata, which the webhook then trusts (Stripe
// metadata is server-set and not client-tamperable after creation).
//
// Defaults to EUR/EURO whenever a spoke can't be resolved, so internal/hub flows and any
// unregistered spoke behave exactly like the legacy EUR-only engine.

import { CurrencyConfig, DEFAULT_CURRENCY, currencyConfigFromSpoke } from './currency-config';

/**
 * Resolve currency by spoke id (preferred) or by recipient Hive account (fallback).
 * Either may be absent. Never throws — always yields a usable config (EUR default).
 */
export async function resolveSpokeCurrency(opts: {
  spokeId?: string | null;
  account?: string | null;
}): Promise<CurrencyConfig> {
  const spokeId = opts.spokeId?.trim();
  const account = opts.account?.trim();
  if (!spokeId && !account) return DEFAULT_CURRENCY;

  try {
    const { default: prisma } = await import('./prisma');

    if (spokeId) {
      const spoke = await prisma.spoke.findUnique({
        where: { id: spokeId },
        select: { fiat_currency: true, iou_token: true },
      });
      if (spoke) return currencyConfigFromSpoke(spoke.fiat_currency, spoke.iou_token);
    }

    if (account) {
      const acct = await prisma.spoke_account.findFirst({
        where: { hive_account: account },
        select: { spoke: { select: { fiat_currency: true, iou_token: true } } },
      });
      if (acct?.spoke) {
        return currencyConfigFromSpoke(acct.spoke.fiat_currency, acct.spoke.iou_token);
      }
    }
  } catch (e) {
    console.warn('[spoke-currency] resolution failed, defaulting to EUR:', e);
  }

  return DEFAULT_CURRENCY;
}
