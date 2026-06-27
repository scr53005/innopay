import { describe, it, expect } from 'vitest';
import {
  EUR_CONFIG,
  RON_CONFIG,
  DEFAULT_CURRENCY,
  getCurrencyConfig,
  currencyConfigFromSpoke,
  convertFiatToHbd,
  convertHbdToFiat,
  deriveUsdPerFiat,
} from './currency-config';

describe('getCurrencyConfig', () => {
  it('resolves known fiats', () => {
    expect(getCurrencyConfig('EUR')).toEqual(EUR_CONFIG);
    expect(getCurrencyConfig('RON')).toEqual(RON_CONFIG);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(getCurrencyConfig('eur')).toEqual(EUR_CONFIG);
    expect(getCurrencyConfig('  ron  ')).toEqual(RON_CONFIG);
  });

  // The single most important property of the whole epic: anything that can't resolve a
  // currency must behave exactly like the pre-existing EUR-only engine.
  it('falls back to EUR for unknown / empty / null (backward-compat safety)', () => {
    expect(getCurrencyConfig(undefined)).toEqual(DEFAULT_CURRENCY);
    expect(getCurrencyConfig(null)).toEqual(DEFAULT_CURRENCY);
    expect(getCurrencyConfig('')).toEqual(DEFAULT_CURRENCY);
    expect(getCurrencyConfig('GBP')).toEqual(EUR_CONFIG);
    expect(DEFAULT_CURRENCY).toEqual(EUR_CONFIG);
  });
});

describe('minimum-amount floors', () => {
  it('keeps the original EUR floors (15 top-up / 3 account creation)', () => {
    expect(EUR_CONFIG.minTopup).toBe(15);
    expect(EUR_CONFIG.minAccountCreation).toBe(3);
  });

  it('uses RON floors of EUR × 6 (90 / 18)', () => {
    expect(RON_CONFIG.minTopup).toBe(90);
    expect(RON_CONFIG.minAccountCreation).toBe(18);
  });

  it('carries the right display symbol and round increment per currency', () => {
    expect(EUR_CONFIG.symbol).toBe('€');
    expect(EUR_CONFIG.roundIncrement).toBe(5);
    expect(RON_CONFIG.symbol).toBe('lei');
    expect(RON_CONFIG.roundIncrement).toBe(30);
  });

  it('falls back to EUR floors for an unknown currency', () => {
    expect(getCurrencyConfig('GBP').minTopup).toBe(15);
    expect(getCurrencyConfig('GBP').minAccountCreation).toBe(3);
  });
});

describe('currencyConfigFromSpoke', () => {
  it('resolves by fiat when the DB token matches the registry', () => {
    expect(currencyConfigFromSpoke('RON', 'LEI')).toEqual(RON_CONFIG);
    expect(currencyConfigFromSpoke('EUR', 'EURO')).toEqual(EUR_CONFIG);
  });

  it('lets the DB token override the registry token but derives the rest from fiat', () => {
    const cfg = currencyConfigFromSpoke('RON', 'LEU');
    expect(cfg.iouToken).toBe('LEU');
    expect(cfg.stripeCurrency).toBe('ron');
    expect(cfg.ratePair).toBe('RON/USD');
  });

  it('treats an empty/missing DB token as "use registry default"', () => {
    expect(currencyConfigFromSpoke('EUR', null)).toEqual(EUR_CONFIG);
    expect(currencyConfigFromSpoke('RON', '')).toEqual(RON_CONFIG);
  });
});

describe('convertFiatToHbd / convertHbdToFiat', () => {
  it('keeps EUR math identical to the old convertEurToHbd (eur * usdPerEur)', () => {
    // 10 EUR at 1.08 USD/EUR → 10.8 HBD (HBD ≈ USD)
    expect(convertFiatToHbd(10, 1.08)).toBeCloseTo(10.8, 6);
  });

  it('prices RON correctly (ron * usdPerRon)', () => {
    // 40 RON at ~0.2173 USD/RON → ~8.692 HBD. Inverting the rate here would be a ~25x
    // mispricing — this is the regression guard for the Step-2 ECB derivation.
    expect(convertFiatToHbd(40, 0.2173)).toBeCloseTo(8.692, 3);
  });

  it('round-trips fiat → HBD → fiat', () => {
    const usdPerFiat = 0.2173;
    expect(convertHbdToFiat(convertFiatToHbd(40, usdPerFiat), usdPerFiat)).toBeCloseTo(40, 6);
  });

  it('guards divide-by-zero', () => {
    expect(convertHbdToFiat(10, 0)).toBe(0);
  });
});

describe('deriveUsdPerFiat (ECB rate derivation — the critical guard)', () => {
  // Representative ECB "per 1 EUR" quotes.
  const ratesPerEur = { USD: 1.0834, RON: 4.9756, GBP: 0.8512 };

  it('returns USD-per-EUR directly for EUR', () => {
    expect(deriveUsdPerFiat(ratesPerEur, 'EUR')).toBeCloseTo(1.0834, 6);
  });

  it('derives USD-per-RON as USD/EUR ÷ RON/EUR (NOT inverted)', () => {
    expect(deriveUsdPerFiat(ratesPerEur, 'RON')).toBeCloseTo(1.0834 / 4.9756, 6);
    // sanity: a RON is worth far less than a USD, so usdPerRon must be < 1
    expect(deriveUsdPerFiat(ratesPerEur, 'RON')).toBeLessThan(1);
  });

  it('end-to-end: 40 RON prices to ~8.7 HBD, not ~199', () => {
    const usdPerRon = deriveUsdPerFiat(ratesPerEur, 'RON');
    expect(convertFiatToHbd(40, usdPerRon)).toBeCloseTo(8.71, 1);
  });

  it('treats USD as 1 and is case/space-insensitive', () => {
    expect(deriveUsdPerFiat(ratesPerEur, 'USD')).toBe(1);
    expect(deriveUsdPerFiat(ratesPerEur, ' ron ')).toBeCloseTo(1.0834 / 4.9756, 6);
  });

  it('throws (fails loud) on a missing USD or fiat rate', () => {
    expect(() => deriveUsdPerFiat({ RON: 4.97 }, 'RON')).toThrow(/USD/);
    expect(() => deriveUsdPerFiat({ USD: 1.08 }, 'RON')).toThrow(/RON/);
  });
});
