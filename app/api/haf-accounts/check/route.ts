// app/api/haf-accounts/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a connection pool to the HAF database
// This will be reused across requests for better performance
let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.HAF_CONNECTION_STRING,
      max: 10, // Maximum number of connections in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
    });
  }
  return pool;
}

/**
 * POST /api/haf-accounts/check
 * Checks if a Hive username is available (doesn't exist in the HAF database)
 * Body: { accountName: string }
 * Returns: { available: boolean, message?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { accountName } = await req.json();

    if (!accountName) {
      return NextResponse.json(
        { available: false, message: 'Account name is required' },
        { status: 400 }
      );
    }

    // Validate account name format (basic Hive rules)
    if (accountName.length < 3 || accountName.length > 16) {
      return NextResponse.json(
        { available: false, message: 'Account name must be between 3 and 16 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9\-\.]+$/.test(accountName)) {
      return NextResponse.json(
        { available: false, message: 'Account name can only contain lowercase letters, numbers, hyphens, and dots' },
        { status: 400 }
      );
    }

    // Check if HAF connection string is configured
    if (!process.env.HAF_CONNECTION_STRING) {
      console.warn('HAF_CONNECTION_STRING not configured, falling back to blockchain check');
      // Fallback: Could import and use accountExists from services/hive.ts here
      return NextResponse.json(
        { available: true, message: 'HAF database not configured, cannot verify availability' },
        { status: 200 }
      );
    }

    const hafPool = getPool();

    // Query the HAF database to check if account exists
    const result = await hafPool.query(
      'SELECT name FROM hafsql.accounts WHERE name = $1 LIMIT 1',
      [accountName]
    );

    const available = result.rows.length === 0;

    return NextResponse.json({
      available,
      message: available
        ? 'Username is available'
        : 'Username is already taken',
    });

  } catch (error: any) {
    console.error('Error checking account availability via HAF:', error);

    // Return a graceful error response
    return NextResponse.json(
      {
        available: false,
        message: 'Unable to verify username availability. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/haf-accounts/check?accountName=username
 * Alternative GET endpoint for checking username availability
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountName = searchParams.get('accountName');

  if (!accountName) {
    return NextResponse.json(
      { available: false, message: 'Account name is required' },
      { status: 400 }
    );
  }

  try {
    // Validate account name format
    if (accountName.length < 3 || accountName.length > 16) {
      return NextResponse.json(
        { available: false, message: 'Account name must be between 3 and 16 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9\-\.]+$/.test(accountName)) {
      return NextResponse.json(
        { available: false, message: 'Account name can only contain lowercase letters, numbers, hyphens, and dots' },
        { status: 400 }
      );
    }

    // Check if HAF connection string is configured
    if (!process.env.HAF_CONNECTION_STRING) {
      console.warn('HAF_CONNECTION_STRING not configured');
      return NextResponse.json(
        { available: true, message: 'HAF database not configured, cannot verify availability' },
        { status: 200 }
      );
    }

    const hafPool = getPool();

    // Query the HAF database
    const result = await hafPool.query(
      'SELECT name FROM hafsql.accounts WHERE name = $1 LIMIT 1',
      [accountName]
    );

    const available = result.rows.length === 0;

    return NextResponse.json({
      available,
      message: available
        ? 'Username is available'
        : 'Username is already taken',
    });

  } catch (error: any) {
    console.error('Error checking account availability via HAF:', error);

    return NextResponse.json(
      {
        available: false,
        message: 'Unable to verify username availability. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
