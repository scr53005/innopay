// app/api/suggest-username/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Reuse connection pool from HAF check endpoint
let pool: Pool | null = null;

function getHafPool() {
  if (!pool) {
    const connectionString = process.env.HAF_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('HAF_CONNECTION_STRING not configured');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

/**
 * GET /api/suggest-username
 * Returns the first available sequential username by finding gaps in HAF database
 * Format: test000-000-XXX (dev/test) or inno000-000-XXX (production)
 *
 * Algorithm:
 * 1. Query HAF for all accounts matching pattern /(?:test|inno)(\d{3})-(\d{3})-(\d{3})/
 * 2. Extract numbers and create ordered set
 * 3. Find first gap (missing number) in sequence
 * 4. Return formatted username with that number
 *
 * Returns: { suggestedUsername: string }
 */
export async function GET() {
  const prefix = process.env.ACCOUNT_PREFIX || 'test';

  try {
    const hafPool = getHafPool();

    // Query all accounts matching our pattern from HAF
    // Pattern: test000-000-001 or inno000-000-001
    const result = await hafPool.query(`
      SELECT name
      FROM hafsql.accounts
      WHERE name ~ '^(test|inno)\\d{3}-\\d{3}-\\d{3}$'
      ORDER BY name ASC
    `);

    console.log(`[SUGGEST USERNAME] Found ${result.rows.length} existing sequential accounts`);

    // Extract numbers from account names and create set of used numbers
    const usedNumbers = new Set<number>();
    const pattern = /^(?:test|inno)(\d{3})-(\d{3})-(\d{3})$/;

    for (const row of result.rows) {
      const match = row.name.match(pattern);
      if (match) {
        const num = parseInt(match[1] + match[2] + match[3], 10);
        usedNumbers.add(num);
      }
    }

    // Find first available number (first gap in sequence)
    let nextNumber = 1; // Start from 1 (000-000-001)
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    // Format the username: prefix + 9-digit number with dashes
    const paddedNumber = nextNumber.toString().padStart(9, '0');
    const suggestedUsername = `${prefix}${paddedNumber.slice(0, 3)}-${paddedNumber.slice(3, 6)}-${paddedNumber.slice(6, 9)}`;

    console.log(`[SUGGEST USERNAME] First available number: ${nextNumber}, formatted: ${suggestedUsername}`);

    return NextResponse.json({
      suggestedUsername
    });

  } catch (error: any) {
    console.error('[SUGGEST USERNAME] Error:', error);

    // Fallback: start from beginning of sequence
    const suggestedUsername = `${prefix}000-000-001`;

    console.log(`[SUGGEST USERNAME] Fallback to: ${suggestedUsername}`);

    return NextResponse.json({
      suggestedUsername
    });
  }
}
