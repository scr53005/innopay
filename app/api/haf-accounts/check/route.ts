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
  try {
    const { searchParams } = new URL(req.url);
    const accountName = searchParams.get('accountName');

    // Fast fail if no account name
    if (!accountName) {
      return NextResponse.json({ available: false });
    }

    const hafPool = getPool();

    // Fast indexed query - hafsql.accounts.name should be indexed
    const result = await hafPool.query(
      'SELECT 1 FROM hafsql.accounts WHERE name = $1 LIMIT 1',
      [accountName]
    );

    // Return simple boolean - account is available if NOT found in database
    return NextResponse.json({ available: result.rows.length === 0 });

  } catch (error: any) {
    console.error('[HAF CHECK] Error:', error);

    // On error, return unavailable (safer default)
    return NextResponse.json({ available: false });
  }
}
