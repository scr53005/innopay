import { NextRequest, NextResponse } from 'next/server';
import { getUsdPerFiatServerSide } from '@/services/currency';

/**
 * GET /api/balance/euro?account=<accountName>&token=<EURO|LEI>&fiat=<EUR|RON>
 * Fetches the customer's IOU-token balance with a robust fallback mechanism.
 *
 * `token`/`fiat` are optional and default to EURO/EUR, so existing callers (the Luxembourg
 * spokes) are unchanged; RON spokes (Zenbar) pass token=LEI&fiat=RON to read the right token
 * and convert the HBD fallback at the RON rate instead of EUR.
 *
 * Strategy:
 * 1. Try multiple Hive-Engine endpoints with 2-second timeout each
 * 2. Fallback to HBD balance from Hive blockchain (converted to fiat)
 * 3. Return error only if all APIs fail
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountName = searchParams.get('account');
  const token = searchParams.get('token') || 'EURO';
  const fiat = searchParams.get('fiat') || 'EUR';

  if (!accountName) {
    return NextResponse.json(
      { error: 'Missing account parameter' },
      { status: 400 }
    );
  }

  console.log(`[BALANCE API] Fetching ${token} balance for:`, accountName);

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
              symbol: token
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
          const tokenBalance = parseFloat(balanceData.result[0].balance);
          console.log(`[BALANCE API] Real ${token} balance from Hive-Engine:`, tokenBalance);

          return NextResponse.json({
            balance: tokenBalance,
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
    // Fetch <fiat>/USD rate first (server-side, DB/ECB-backed)
    const rateData = await getUsdPerFiatServerSide(fiat);
    const usdPerFiat = rateData.conversion_rate;
    console.log(`[BALANCE API] ${fiat}/USD rate for fallback:`, usdPerFiat);

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
        const calculatedFiatBalance = hbdBalance / usdPerFiat;

        console.log(`[BALANCE API] HBD balance:`, hbdBalance, `Calculated ${fiat}:`, calculatedFiatBalance);

        return NextResponse.json({
          balance: calculatedFiatBalance,
          source: 'hive-hbd-conversion',
          hbdBalance,
          eurUsdRate: usdPerFiat
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
