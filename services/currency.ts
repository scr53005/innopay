// services/currency.ts
// Currency conversion utilities for EUR/USD rate

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
 */
export function convertEurToHbd(eurAmount: number, eurUsdRate: number): number {
  // To convert EUR to USD (HBD), multiply by the rate
  // Example: 10 EUR with EUR/USD rate of 1.10 = 10 * 1.10 = 11.00 USD (HBD)
  return eurAmount * eurUsdRate;
}

/**
 * Server-side function to fetch EUR/USD rate directly from ECB or database
 * This bypasses the API route for server-side usage
 * @param today - The date to fetch the rate for (optional, defaults to today)
 * @returns CurrencyRate object
 */
export async function getEurUsdRateServerSide(today?: Date): Promise<CurrencyRate> {
  const targetDate = today || new Date();
  const todayStr = targetDate.toISOString().split('T')[0];

  // Import prisma dynamically to avoid issues in client components
  const { default: prisma } = await import('@/lib/prisma');
  const { parseStringPromise } = await import('xml2js');

  // Step 1: Check database for existing rate
  try {
    const latestRate = await prisma.currencyConversion.findFirst({
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
    console.warn('Failed to fetch rate from DB:', dbError);
  }

  // Step 2: Fetch from ECB if not in database
  try {
    const response = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml');
    if (response.ok) {
      const xml = await response.text();
      const parsed = await parseStringPromise(xml);
      const cube = parsed['gesmes:Envelope']['Cube'][0]['Cube'][0]['Cube'];
      const usdRate = cube.find((entry: any) => entry['$'].currency === 'USD')['$'].rate;
      const rate = parseFloat(usdRate);

      return {
        date: new Date().toISOString(),
        conversion_rate: rate,
        isFresh: true,
      };
    }
  } catch (error) {
    console.warn('Failed to fetch from ECB:', error);
  }

  // Fallback to 1.0
  return {
    date: targetDate.toISOString(),
    conversion_rate: 1.0,
    isFresh: false,
  };
}
