/**
 * useBalance Hook
 * React Query hook for fetching and managing EURO balance from Hive-Engine
 *
 * Created: 2026-01-09
 * Purpose: Auto-refresh balance after topups to fix stale balance bug
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';

interface BalanceResponse {
  balance: number;
  source: 'localStorage-cache' | 'hive-engine' | 'mock-account';
  timestamp: number;
}

interface UseBalanceOptions {
  enabled?: boolean; // Whether to automatically fetch (default: true)
  refetchInterval?: number | false; // Auto-refetch interval (default: false)
}

interface UseBalanceReturn {
  balance: number | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  source: string | null;
  refetch: () => void;
  invalidate: () => void; // Force refetch
}

/**
 * Fetch EURO balance from Hive-Engine
 */
async function fetchEuroBalance(accountName: string): Promise<BalanceResponse> {
  console.log('[useBalance] 🔄 Fetching balance for:', accountName);

  // Skip blockchain fetch for mock accounts (dev/test only)
  const isMockAccount = accountName.startsWith('mockaccount');
  if (isMockAccount) {
    console.log('[useBalance] ⚠️ Mock account detected - skipping Hive-Engine API call');
    const savedBalance = parseFloat(localStorage.getItem('innopay_lastBalance') || '0');
    console.log('[useBalance] Loading mock account balance from localStorage:', savedBalance);

    return {
      balance: savedBalance,
      source: 'mock-account',
      timestamp: Date.now(),
    };
  }

  try {
    const response = await fetch('https://api.hive-engine.com/rpc/contracts', {
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
      })
    });

    if (!response.ok) {
      console.warn('[useBalance] Hive-Engine API returned', response.status);
      const lastBalance = parseFloat(localStorage.getItem('innopay_lastBalance') || '0');
      return { balance: lastBalance, source: 'localStorage-cache', timestamp: Date.now() };
    }

    const data = await response.json();

    if (data.result && data.result.length > 0) {
      const euroBalance = parseFloat(data.result[0].balance);
      const formattedBalance = parseFloat(euroBalance.toFixed(2));

      console.log('[useBalance] ✅ Balance retrieved from Hive-Engine:', formattedBalance);

      // Save to localStorage for optimistic UI
      localStorage.setItem('innopay_lastBalance', formattedBalance.toString());

      return {
        balance: formattedBalance,
        source: 'hive-engine',
        timestamp: Date.now(),
      };
    } else {
      console.log('[useBalance] No EURO tokens found');

      // Save zero balance to localStorage
      localStorage.setItem('innopay_lastBalance', '0');

      return {
        balance: 0,
        source: 'hive-engine',
        timestamp: Date.now(),
      };
    }
  } catch (error) {
    console.warn('[useBalance] Error fetching balance:', error);
    // Fall back to last known balance so the UI doesn't break
    const lastBalance = parseFloat(localStorage.getItem('innopay_lastBalance') || '0');
    return { balance: lastBalance, source: 'cache', timestamp: Date.now() };
  }
}

/**
 * Hook to fetch and manage EURO balance for a Hive account
 *
 * Features:
 * - Automatic refetch on mount (ensures fresh data after topups)
 * - Optimistic localStorage fallback for instant UI
 * - Manual refetch support
 * - Cache invalidation for forcing updates
 *
 * @param accountName - Hive account name (e.g., 'test000-000-020')
 * @param options - Query options (enabled, refetchInterval)
 * @returns Balance data and control functions
 */
export function useBalance(
  accountName: string | null,
  options: UseBalanceOptions = {}
): UseBalanceReturn {
  const { enabled = true, refetchInterval = false } = options;
  const queryClient = useQueryClient();

  // Query for fetching balance
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BalanceResponse, Error>({
    queryKey: ['balance', accountName],
    queryFn: async () => {
      if (!accountName) {
        throw new Error('No account name provided');
      }

      return await fetchEuroBalance(accountName);
    },
    enabled: enabled && !!accountName,
    // Inherited from global QueryProvider config:
    // - staleTime: 0 (always fetch fresh)
    // - refetchOnMount: true (refetch when component mounts)
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchInterval, // Only refetch on interval if explicitly requested
    // Provide initial data from localStorage cache (for instant UI)
    initialData: () => {
      if (!accountName) return undefined;

      const cached = localStorage.getItem('innopay_lastBalance');
      if (cached) {
        const balance = parseFloat(cached);
        console.log('[useBalance] 📦 Using cached balance for instant UI:', balance, '(will refetch fresh data immediately)');
        return {
          balance,
          source: 'localStorage-cache',
          timestamp: Date.now(),
        };
      }
      return undefined;
    },
    // Retry on failure
    retry: 2,
  });

  // Invalidate function to force refetch
  const invalidate = () => {
    console.log('[useBalance] Invalidating balance cache for:', accountName);
    queryClient.invalidateQueries({ queryKey: ['balance', accountName] });
  };

  return {
    balance: data?.balance ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    source: data?.source ?? null,
    refetch: () => {
      refetch();
    },
    invalidate,
  };
}
