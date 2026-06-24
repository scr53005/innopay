// services/currency.ts
// Currency conversion utilities. Originally EUR/USD-only; generalized to any ECB fiat
// (EUR, RON, …) for the multi-currency engine. The pure descriptor + math live in
// lib/currency-config.ts; this module is the I/O layer (ECB fetch + DB cache).

import { deriveUsdPerFiat } from '../lib/currency-config';

// Interface for the return type
export interface CurrencyRate {
  date: string; // ISO string from API
  conversion_rate: number;
  isFresh: boolean;
}

/**
 * Fetches the latest EUR/USD rate from the API
 * @param today - The date to fetch the rate for
 * @returns CurrencyRate object with date, conversion_rate, and isFresh flag
 */
export async function getLatestEurUsdRate(today: Date): Promise<CurrencyRate> {
  const todayStr = today.toISOString().split('T')[0];
  try {
    const response = await fetch(`/api/currency?today=${todayStr}`);
    if (!response.ok) {
      console.warn('Failed to fetch currency rate from API, status:', response.status);
      return {
        date: today.toISOString(),
        conversion_rate: 1.0,
        isFresh: false,
      };
    }
    const data: CurrencyRate = await response.json();
    return data;
  } catch (error) {
    console.warn('Error fetching currency rate from API:', error);
    return {
      date: today.toISOString(),
      conversion_rate: 1.0,
      isFresh: false,
    };
  }
}

/**
 * Converts HBD amount to EUR using the provided exchange rate
 * HBD is pegged to USD, so we use EUR/USD rate
 * @param hbdAmount - Amount in HBD (which equals USD)
 * @param eurUsdRate - EUR to USD exchange rate
 * @returns Amount in EUR
 *
 * NOTE: retained for the existing EUR call sites. New/multi-currency code should prefer
 * convertHbdToFiat(hbdAmount, usdPerFiat) from lib/currency-config (identical math for EUR).
 */
export function convertHbdToEur(hbdAmount: number, eurUsdRate: number): number {
  if (eurUsdRate === 0) {
    console.warn('EUR/USD rate is 0, returning 0');
    return 0;
  }
  // Since HBD ≈ USD, to convert to EUR we divide by the EUR/USD rate
  // Example: 10 USD with EUR/USD rate of 1.10 = 10 / 1.10 = 9.09 EUR
  return hbdAmount / eurUsdRate;
}

/**
 * Converts EUR amount to HBD using the provided exchange rate
 * @param eurAmount - Amount in EUR
 * @param eurUsdRate - EUR to USD exchange rate
 * @returns Amount in HBD (USD equivalent)
 *
 * NOTE: retained for the existing EUR call sites. New/multi-currency code should prefer
 * convertFiatToHbd(fiatAmount, usdPerFiat) from lib/currency-config (identical math for EUR).
 */
export function convertEurToHbd(eurAmount: number, eurUsdRate: number): number {
  // To convert EUR to USD (HBD), multiply by the rate
  // Example: 10 EUR with EUR/USD rate of 1.10 = 10 * 1.10 = 11.00 USD (HBD)
  return eurAmount * eurUsdRate;
}

/**
 * Parse the ECB daily reference XML into a { CURRENCY: ratePerEur } map plus the ECB
 * reference date. Each cube entry is "units of <currency> per 1 EUR" (USD 1.0834, …).
 */
function parseEcbRates(parsed: any): { ratesPerEur: Record<string, number>; ecbDate: Date } {
  const inner = parsed['gesmes:Envelope']['Cube'][0]['Cube'][0];
  const cube = inner['Cube'];
  const ratesPerEur: Record<string, number> = {};
  for (const entry of cube) {
    const cur = entry['$'].currency;
    const rate = parseFloat(entry['$'].rate);
    if (cur && !Number.isNaN(rate)) ratesPerEur[cur] = rate;
  }
  return { ratesPerEur, ecbDate: new Date(inner['$'].time) };
}

/**
 * Server-side: fetch/cache "USD per 1 unit of <fiat>" (= usdPerFiat, what
 * convertFiatToHbd consumes, since 1 HBD ≈ 1 USD). Generalizes the original EUR/USD
 * logic to any ECB-listed fiat. Rates are cached per (date, pair) in currency_conversion;
 * EUR rows keep pair 'EUR/USD' so legacy data and behavior are unchanged.
 *
 * @param fiat - 'EUR' | 'RON' | … (defaults to 'EUR')
 * @param today - target date (optional)
 */
export async function getUsdPerFiatServerSide(fiat: string = 'EUR', today?: Date): Promise<CurrencyRate> {
  const pair = `${fiat.trim().toUpperCase()}/USD`;
  const targetDate = today || new Date();
  const todayStr = targetDate.toISOString().split('T')[0];

  // Import prisma dynamically to avoid issues in client components / test/script chains
  const { default: prisma } = await import('@/lib/prisma');
  const { parseStringPromise } = await import('xml2js');

  // Step 1: latest cached rate for THIS pair
  try {
    const latestRate = await prisma.currencyConversion.findFirst({
      where: { pair },
      orderBy: { date: 'desc' },
    });

    if (latestRate && latestRate.date.toISOString().split('T')[0] === todayStr) {
      return {
        date: latestRate.date.toISOString(),
        conversion_rate: parseFloat(latestRate.conversionRate.toString()),
        isFresh: false,
      };
    }
  } catch (dbError) {
    console.warn(`[CURRENCY] Failed to fetch ${pair} rate from DB:`, dbError);
  }

  // Step 2: Fetch from ECB if not cached for today
  try {
    const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
    if (response.ok) {
      const xml = await response.text();
      const parsed = await parseStringPromise(xml);
      const { ratesPerEur, ecbDate } = parseEcbRates(parsed);
      const usdPerFiat = deriveUsdPerFiat(ratesPerEur, fiat);

      // Step 3: Check if this (date, pair) already exists
      try {
        const existingRate = await prisma.currencyConversion.findUnique({
          where: { date_pair: { date: ecbDate, pair } },
        });
        if (existingRate) {
          console.log(`[CURRENCY] ${pair} rate for date already in DB:`, ecbDate.toISOString().split('T')[0]);
          return {
            date: existingRate.date.toISOString(),
            conversion_rate: parseFloat(existingRate.conversionRate.toString()),
            isFresh: false,
          };
        }
      } catch (dbCheckError) {
        console.warn(`[CURRENCY] Failed to check existing ${pair} date:`, dbCheckError);
      }

      const isFresh = ecbDate.toISOString().split('T')[0] === todayStr;

      // Step 4: Persist the new rate
      try {
        await prisma.currencyConversion.create({
          data: { date: ecbDate, pair, conversionRate: usdPerFiat },
        });
        console.log(`[CURRENCY] Saved new ${pair} rate to DB:`, ecbDate.toISOString().split('T')[0], 'Rate:', usdPerFiat);
      } catch (dbSaveError: any) {
        if (dbSaveError.code === 'P2002') {
          console.warn(`[CURRENCY] ${pair} rate already exists (race condition):`, ecbDate.toISOString().split('T')[0]);
        } else {
          console.warn(`[CURRENCY] Failed to save ${pair} rate to DB:`, dbSaveError);
        }
        // Continue even if save fails - we still have the rate
      }

      return {
        date: ecbDate.toISOString(),
        conversion_rate: usdPerFiat,
        isFresh,
      };
    }
  } catch (error) {
    console.warn(`[CURRENCY] Failed to fetch/derive ${pair} from ECB:`, error);
  }

  // Fallback: EUR preserves the historical 1.0 fallback; non-EUR has no safe guess, so we
  // return 0 (→ convertFiatToHbd yields 0 → no HBD leg → full IOU-token fallback + debt).
  // Callers must treat a 0/stale rate as "could not price in HBD" (hardened in Step 4).
  return {
    date: targetDate.toISOString(),
    conversion_rate: fiat.trim().toUpperCase() === 'EUR' ? 1.0 : 0,
    isFresh: false,
  };
}

/**
 * Backward-compatible EUR/USD accessor (USD per 1 EUR). Delegates to the generic fn so
 * existing EUR call sites are byte-identical.
 */
export async function getEurUsdRateServerSide(today?: Date): Promise<CurrencyRate> {
  return getUsdPerFiatServerSide('EUR', today);
}
