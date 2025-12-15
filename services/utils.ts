import 'dotenv/config';

const ACCOUNT_PREFIX = process.env.ACCOUNT_PREFIX || 'test';

/**
 * A helper to format a number into the required account name format (e.g., 'test000-000-001').
 * It uses the ACCOUNT_PREFIX environment variable.
 * @param {number} num - The number to format.
 * @returns {string} The formatted account name string.
 */
export function formatAccountName(num: number): string {
  const formattedNumber = num.toString().padStart(9, '0');
  return `${ACCOUNT_PREFIX}${formattedNumber.slice(0, 3)}-${formattedNumber.slice(3, 6)}-${formattedNumber.slice(6, 9)}`;
}

/**
 * Restaurant configuration mapping
 * Maps restaurant identifiers to their Hive accounts and domain patterns
 */
interface RestaurantConfig {
  hiveAccount: string;
  prodDomain: string;
  localPort: number;
}

const RESTAURANT_CONFIGS: Record<string, RestaurantConfig> = {
  'indies': {
    hiveAccount: 'indies.cafe',
    prodDomain: 'indies.innopay.lu',
    localPort: 3001,
  },
  // Future restaurants can be added here:
  // 'pizzeria': {
  //   hiveAccount: 'pizzeria.hive',
  //   prodDomain: 'pizzeria.innopay.lu',
  //   localPort: 3002,
  // },
};

/**
 * Determines the restaurant URL based on environment and restaurant name
 * @param restaurantName - The restaurant identifier (e.g., 'indies', 'pizzeria')
 * @param path - Optional path to append (e.g., '/menu')
 * @returns The full URL for the restaurant
 */
export function getRestaurantUrl(restaurantName: string = 'indies', path: string = '/menu'): string {
  const config = RESTAURANT_CONFIGS[restaurantName];

  if (!config) {
    console.warn(`[RESTAURANT URL] Unknown restaurant: ${restaurantName}, defaulting to indies`);
    return getRestaurantUrl('indies', path);
  }

  // Server-side fallback
  if (typeof window === 'undefined') {
    return `https://${config.prodDomain}${path}`;
  }

  const hostname = window.location.hostname;

  if (hostname === 'localhost') {
    return `http://localhost:${config.localPort}${path}`;
  } else if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    // Local network
    return `http://${hostname}:${config.localPort}${path}`;
  } else if (hostname === 'wallet.innopay.lu' || hostname.includes('vercel.app')) {
    // Production
    return `https://${config.prodDomain}${path}`;
  } else {
    // Default to localhost for unknown environments
    return `http://localhost:${config.localPort}${path}`;
  }
}

/**
 * Detects which restaurant the user came from based on URL parameters
 * @param searchParams - URLSearchParams object from Next.js
 * @returns The restaurant name, or null if not from a restaurant
 */
export function detectRestaurant(searchParams: URLSearchParams): string | null {
  // Check if there's a restaurant parameter
  const restaurantParam = searchParams.get('restaurant');
  if (restaurantParam && RESTAURANT_CONFIGS[restaurantParam]) {
    return restaurantParam;
  }

  // Check if there's a table parameter (implies indies for now)
  const table = searchParams.get('table');
  if (table) {
    return 'indies'; // Default to indies when table is present
  }

  // Check for order_amount (also implies restaurant context)
  const orderAmount = searchParams.get('order_amount');
  if (orderAmount) {
    return 'indies'; // Default to indies
  }

  return null; // Not from a restaurant
}
