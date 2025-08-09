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
