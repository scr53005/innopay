import { NextRequest, NextResponse } from 'next/server';
import { getLatestEurUsdRate } from '@/services/currency';

/**
 * GET /api/balance/euro?account=<accountName>
 * Fetches EURO token balance with robust fallback mechanism
 *
 * Strategy:
 * 1. Try multiple Hive-Engine endpoints with 2-second timeout each
 * 2. Fallback to HBD balance from Hive blockchain (converted to EUR)
 * 3. Return error only if all APIs fail
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountName = searchParams.get('account');

  if (!accountName) {
    return NextResponse.json(
      { error: 'Missing account parameter' },
      { status: 400 }
    );
  }

  console.log('[BALANCE API] Fetching EURO balance for:', accountName);

  // Step 1: Try to fetch real balance from Hive-Engine (multiple endpoints with timeout)
  const hiveEngineEndpoints = [
    'https://api.hive-engine.com/rpc/contracts',
    'https://engine.rishipanthee.com/contracts',
    'https://herpc.dtools.dev/contracts'
  ];

  for (const endpoint of hiveEngineEndpoints) {
    try {
      console.log('[BALANCE API] Trying Hive-Engine endpoint:', endpoint);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

      const balanceResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'find',
          params: {
            contract: 'tokens',
            table: 'balances',
            query: {
              account: accountName,
              symbol: 'EURO'
            }
          },
          id: 1
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (balanceData.result && balanceData.result.length > 0) {
          const euroBalance = parseFloat(balanceData.result[0].balance);
          console.log('[BALANCE API] Real EURO balance from Hive-Engine:', euroBalance);

          return NextResponse.json({
            balance: euroBalance,
            source: 'hive-engine',
            endpoint
          });
        }
      }
    } catch (error: any) {
      console.warn('[BALANCE API] Hive-Engine endpoint failed:', endpoint, error.message);
      // Continue to next endpoint
    }
  }

  // Step 2: If all Hive-Engine endpoints failed, try HBD balance from Hive as fallback
  console.log('[BALANCE API] All Hive-Engine endpoints failed, trying HBD balance from Hive');

  try {
    // Fetch EUR/USD rate first
    const today = new Date();
    const rateData = await getLatestEurUsdRate(today);
    const eurUsdRate = rateData.conversion_rate;
    console.log('[BALANCE API] EUR/USD rate for fallback:', eurUsdRate);

    // Fetch HBD balance from Hive
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const hiveResponse = await fetch('https://api.hive.blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'condenser_api.get_accounts',
        params: [[accountName]],
        id: 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (hiveResponse.ok) {
      const hiveData = await hiveResponse.json();
      if (hiveData.result && hiveData.result.length > 0) {
        const hbdBalanceStr = hiveData.result[0].hbd_balance;
        const hbdBalance = parseFloat(hbdBalanceStr.split(' ')[0]);
        const calculatedEuroBalance = hbdBalance / eurUsdRate;

        console.log('[BALANCE API] HBD balance:', hbdBalance, 'Calculated EURO:', calculatedEuroBalance);

        return NextResponse.json({
          balance: calculatedEuroBalance,
          source: 'hive-hbd-conversion',
          hbdBalance,
          eurUsdRate
        });
      }
    }
  } catch (error: any) {
    console.error('[BALANCE API] Hive HBD fallback also failed:', error.message);
  }

  // Step 3: All APIs failed
  return NextResponse.json(
    { error: 'Unable to fetch balance from any API endpoint' },
    { status: 503 }
  );
}
