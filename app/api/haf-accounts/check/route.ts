// app/api/haf-accounts/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a connection pool to the HAF database
// This will be reused across requests for better performance
let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.HAF_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('HAF_CONNECTION_STRING not configured');
    }
    pool = new Pool({
      connectionString,
      max: 10, // Maximum number of connections in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
    });
  }
  return pool;
}

/**
 * GET /api/haf-accounts/check?accountName=username
 * Ultra-fast username availability check (< 500ms target)
 *
 * OPTIMIZATIONS:
 * - GET method (no body parsing)
 * - No validation (client-side already validated)
 * - Minimal response payload
 * - Connection pooling
 * - Indexed database query
 *
 * Returns: { available: boolean }
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    const accountName = searchParams.get('accountName');

    console.warn(`[HAF CHECK] ========================================`);
    console.warn(`[HAF CHECK] Checking username: "${accountName}"`);
    console.warn(`[HAF CHECK] Environment: ${process.env.NODE_ENV}`);

    // Fast fail if no account name
    if (!accountName) {
      console.warn(`[HAF CHECK] ❌ No account name provided`);
      return NextResponse.json({ available: false });
    }

    console.warn(`[HAF CHECK] Getting HAF pool connection...`);
    const hafPool = getPool();
    console.warn(`[HAF CHECK] HAF pool obtained successfully`);

    console.warn(`[HAF CHECK] Executing query: SELECT 1 FROM hafsql.accounts WHERE name = '${accountName}' LIMIT 1`);

    // Fast indexed query - hafsql.accounts.name should be indexed
    const result = await hafPool.query(
      'SELECT 1 FROM hafsql.accounts WHERE name = $1 LIMIT 1',
      [accountName]
    );

    const elapsed = Date.now() - startTime;
    const available = result.rows.length === 0;

    console.warn(`[HAF CHECK] Query completed in ${elapsed}ms`);
    console.warn(`[HAF CHECK] Rows found: ${result.rows.length}`);
    console.warn(`[HAF CHECK] Username "${accountName}" is ${available ? '✅ AVAILABLE' : '❌ TAKEN'}`);
    console.warn(`[HAF CHECK] Returning: { available: ${available} }`);
    console.warn(`[HAF CHECK] ========================================`);

    // Return simple boolean - account is available if NOT found in database
    return NextResponse.json({ available });

  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[HAF CHECK] ❌ ERROR after ${elapsed}ms:`, error.message);
    console.error('[HAF CHECK] Error stack:', error.stack);
    console.error('[HAF CHECK] Error details:', JSON.stringify(error, null, 2));
    console.warn(`[HAF CHECK] Returning { available: false } due to error`);
    console.warn(`[HAF CHECK] ========================================`);

    // On error, return unavailable (safer default)
    return NextResponse.json({ available: false });
  }
}
