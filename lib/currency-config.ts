// lib/currency-config.ts
//
// Per-currency descriptor for the multi-currency payment engine.
//
// Background: the engine was originally EUR-only — Stripe charged in EUR and innopay
// issued the EUR-pegged `EURO` Hive-Engine IOU token as collateral/display, with HBD
// (≈ USD) as the canonical settlement asset. To onboard non-Eurozone spokes (Zenbar,
// Romania → RON) we generalize "the fiat + its IOU token" into a `CurrencyConfig`.
//
// EUR/EURO is just the FIRST instance and the DEFAULT, so the existing live spokes
// (indies, croque, millewee) keep byte-identical behavior: anything that can't resolve
// a currency falls back to EUR/EURO.
//
// The spoke→currency MAPPING is authoritative in the `spoke` DB table
// (`fiat_currency`, `iou_token`). This module holds the intrinsic/derived details of
// each currency (Stripe charge code, ECB rate pair) and the lookup that the checkout
// routes + webhook use at runtime.

export interface CurrencyConfig {
  /** Fiat code (ISO 4217-ish), e.g. 'EUR' | 'RON'. Matches `spoke.fiat_currency`. */
  fiat: string;
  /** Hive-Engine IOU token symbol pegged 1:1 to the fiat, e.g. 'EURO' | 'LEI'. Matches `spoke.iou_token`. */
  iouToken: string;
  /** Stripe charge currency (lowercase ISO 4217), e.g. 'eur' | 'ron'. */
  stripeCurrency: string;
  /** ECB-derived exchange pair vs USD used to convert fiat ↔ HBD, e.g. 'EUR/USD' | 'RON/USD'. */
  ratePair: string;
  /**
   * Minimum top-up amount in fiat units. Floors are denominated per-currency (a flat
   * "Stripe-fee-viable" value), NOT rate-derived — a rate-derived minimum would wobble
   * daily and produce confusing, moving error messages. RON ≈ EUR × 6 (RON ~5.2/EUR and
   * sliding; 6 leaves headroom).
   */
  minTopup: number;
  /** Minimum account-creation amount in fiat units (same per-currency rationale as minTopup). */
  minAccountCreation: number;
  /** Display symbol for UI money strings, e.g. '€' | 'lei'. */
  symbol: string;
  /**
   * Increment the top-up prefill rounds up to (fiat units). A UI nicety so suggested amounts
   * land on tidy values (EUR → nearest 5; RON → nearest 30, ≈ EUR × 6). Not a correctness gate.
   */
  roundIncrement: number;
}

// EUR is the original instance and the system-wide default (backward compatibility).
export const EUR_CONFIG: CurrencyConfig = {
  fiat: 'EUR',
  iouToken: 'EURO',
  stripeCurrency: 'eur',
  ratePair: 'EUR/USD',
  minTopup: 15,
  minAccountCreation: 3,
  symbol: '€',
  roundIncrement: 5,
};

// RON is additive — used only by spokes whose `spoke.fiat_currency = 'RON'` (Zenbar).
export const RON_CONFIG: CurrencyConfig = {
  fiat: 'RON',
  iouToken: 'LEI',
  stripeCurrency: 'ron',
  ratePair: 'RON/USD',
  minTopup: 90, // EUR 15 × 6
  minAccountCreation: 18, // EUR 3 × 6
  symbol: 'lei',
  roundIncrement: 30, // EUR 5 × 6
};

export const DEFAULT_CURRENCY: CurrencyConfig = EUR_CONFIG;

const BY_FIAT: Record<string, CurrencyConfig> = {
  EUR: EUR_CONFIG,
  RON: RON_CONFIG,
};

/**
 * Resolve a full CurrencyConfig from a fiat code (e.g. from `spoke.fiat_currency` or a
 * Stripe session's metadata). Unknown/empty → EUR (the safe default that preserves the
 * pre-existing single-currency behavior).
 */
export function getCurrencyConfig(fiat?: string | null): CurrencyConfig {
  if (!fiat) return DEFAULT_CURRENCY;
  return BY_FIAT[fiat.trim().toUpperCase()] ?? DEFAULT_CURRENCY;
}

/**
 * Build a CurrencyConfig directly from the two authoritative `spoke` columns. Falls back
 * to the registry for the derived fields (Stripe code, rate pair). If `iouToken` disagrees
 * with the registry for that fiat, the DB value wins for the token symbol (DB is the
 * source of truth for the spoke→token mapping) while derived fields come from the fiat.
 */
export function currencyConfigFromSpoke(fiat?: string | null, iouToken?: string | null): CurrencyConfig {
  const base = getCurrencyConfig(fiat);
  if (iouToken && iouToken.trim() && iouToken.trim().toUpperCase() !== base.iouToken) {
    return { ...base, iouToken: iouToken.trim().toUpperCase() };
  }
  return base;
}

// ─── Pure fiat ↔ HBD conversion ───
// HBD is pegged to USD (1 HBD ≈ 1 USD, the same assumption used for the Luxembourg
// spokes). `usdPerFiat` is "how many USD one unit of the fiat is worth" — derived from
// the ECB feed in services/currency.ts (Step 2). For EUR this is the ECB USD-per-EUR
// rate directly (≈ 1.08); for RON it is USD-per-EUR ÷ RON-per-EUR (≈ 0.21).
//
// These supersede the EUR-specific convertEurToHbd / convertHbdToEur: for EUR the math is
// identical (eur * usdPerEur), so existing call sites stay numerically unchanged.

export function convertFiatToHbd(fiatAmount: number, usdPerFiat: number): number {
  return fiatAmount * usdPerFiat;
}

export function convertHbdToFiat(hbdAmount: number, usdPerFiat: number): number {
  if (usdPerFiat === 0) {
    console.warn('[currency-config] usdPerFiat is 0, returning 0');
    return 0;
  }
  return hbdAmount / usdPerFiat;
}

// ─── ECB rate derivation ───
// The ECB daily reference feed quotes every currency as "units of <currency> per 1 EUR"
// (e.g. USD 1.0834, RON 4.9756). To price an order we need "USD per 1 unit of the fiat"
// (= usdPerFiat, what convertFiatToHbd consumes, since 1 HBD ≈ 1 USD).
//
//   EUR: usdPerEur = USD-per-EUR directly                         (≈ 1.0834)
//   RON: usdPerRon = USD-per-EUR ÷ RON-per-EUR                    (≈ 1.0834/4.9756 ≈ 0.2178)
//   any X: usdPerX  = USD-per-EUR ÷ X-per-EUR
//
// This is the single most error-prone calculation in the multi-currency work — inverting
// the RON division misprices every Romanian order by ~25×. It is pure (no I/O) precisely
// so it can be pinned by unit tests. Throws on a missing/invalid rate rather than silently
// returning a wrong number — money code must fail loud, and callers handle the fallback.
export function deriveUsdPerFiat(ratesPerEur: Record<string, number>, fiat: string): number {
  const f = fiat.trim().toUpperCase();
  const usdPerEur = ratesPerEur['USD'];
  if (!usdPerEur || usdPerEur <= 0) {
    throw new Error('deriveUsdPerFiat: missing/invalid USD rate in ECB feed');
  }
  if (f === 'EUR') return usdPerEur;
  if (f === 'USD') return 1;
  const fiatPerEur = ratesPerEur[f];
  if (!fiatPerEur || fiatPerEur <= 0) {
    throw new Error(`deriveUsdPerFiat: missing/invalid ECB rate for ${f}`);
  }
  return usdPerEur / fiatPerEur;
}
