'use client';

import { useEffect, useState } from 'react';
import { isDevHostname } from '../lib/dev-host';

/**
 * True on a dev server, decided after mount. Reading window.location during render made the server
 * HTML (no window: nothing drawn) differ from the phone's first render (dev button drawn), so React
 * reported "Hydration failed" on every dev page load.
 */
export function useIsDevHost(): boolean {
  const [isDev, setIsDev] = useState(false);
  useEffect(() => { setIsDev(isDevHostname(window.location.hostname)); }, []);
  return isDev;
}
