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
  console.warn(`[SUGGEST USERNAME] ========================================`);
  console.warn(`[SUGGEST USERNAME] Request started with prefix: ${prefix}`);
  console.warn(`[SUGGEST USERNAME] Environment: ${process.env.NODE_ENV}`);

  try {
    console.warn(`[SUGGEST USERNAME] Getting HAF pool connection...`);
    const hafPool = getHafPool();
    console.warn(`[SUGGEST USERNAME] HAF pool obtained successfully`);

    // Query all accounts matching our pattern from HAF
    // Pattern: test000-000-001 or inno000-000-001
    console.warn(`[SUGGEST USERNAME] Executing HAF query for sequential accounts...`);
    const result = await hafPool.query(`
      SELECT name
      FROM hafsql.accounts
      WHERE name ~ '^(test|inno)\\d{3}-\\d{3}-\\d{3}$'
      ORDER BY name ASC
    `);

    console.warn(`[SUGGEST USERNAME] ✅ Query successful! Found ${result.rows.length} existing sequential accounts`);
    if (result.rows.length > 0) {
      console.warn(`[SUGGEST USERNAME] First account: ${result.rows[0].name}`);
      console.warn(`[SUGGEST USERNAME] Last account: ${result.rows[result.rows.length - 1].name}`);
    }

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

    console.warn(`[SUGGEST USERNAME] Extracted ${usedNumbers.size} used numbers from account names`);
    const usedArray = Array.from(usedNumbers).sort((a, b) => a - b);
    if (usedArray.length > 0) {
      console.warn(`[SUGGEST USERNAME] Used numbers range: ${usedArray[0]} to ${usedArray[usedArray.length - 1]}`);
    }

    // Find first available number (first gap in sequence)
    let nextNumber = 1; // Start from 1 (000-000-001)
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    console.warn(`[SUGGEST USERNAME] First available number found: ${nextNumber}`);

    // Format the username: prefix + 9-digit number with dashes
    const paddedNumber = nextNumber.toString().padStart(9, '0');
    const suggestedUsername = `${prefix}${paddedNumber.slice(0, 3)}-${paddedNumber.slice(3, 6)}-${paddedNumber.slice(6, 9)}`;

    console.warn(`[SUGGEST USERNAME] ✅ Suggested username: ${suggestedUsername}`);
    console.warn(`[SUGGEST USERNAME] ========================================`);

    return NextResponse.json({
      suggestedUsername
    });

  } catch (error: any) {
    console.error('[SUGGEST USERNAME] ❌ ERROR:', error.message);
    console.error('[SUGGEST USERNAME] Error stack:', error.stack);
    console.error('[SUGGEST USERNAME] Error details:', JSON.stringify(error, null, 2));

    // Fallback: start from beginning of sequence
    const suggestedUsername = `${prefix}000-000-001`;

    console.warn(`[SUGGEST USERNAME] ⚠️ Using fallback username: ${suggestedUsername}`);
    console.warn(`[SUGGEST USERNAME] ========================================`);

    return NextResponse.json({
      suggestedUsername
    });
  }
}
