'use client';

import { useEffect, useState } from 'react';
import { fetchRubisBalance, readCachedRubis, saveCachedRubis } from '../lib/rubis-balance';

/**
 * RUBIS for the hub MiniWallet: the last known value from the cache at once, then a fresh
 * Hive-Engine read. Stays on the cached value (or null = no strip) when Hive-Engine is unreachable.
 */
export function useRubisBalance(accountName: string | null | undefined): number | null {
  const [rubis, setRubis] = useState<number | null>(null);

  useEffect(() => {
    if (!accountName) { setRubis(null); return; }
    let cancelled = false;
    // Read the cache after mount, not during render: the server has no localStorage (hydration).
    setRubis(readCachedRubis(localStorage, accountName));
    fetchRubisBalance(accountName).then((fresh) => {
      if (cancelled || fresh === null) return;
      saveCachedRubis(localStorage, accountName, fresh);
      setRubis(fresh);
    });
    return () => { cancelled = true; };
  }, [accountName]);

  return rubis;
}
