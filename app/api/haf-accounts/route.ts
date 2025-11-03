import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a connection pool to the HAF database
// Using a pool is more efficient than creating new connections for each request
const pool = new Pool({
  connectionString: process.env.HAF_CONNECTION_STRING,
  ssl: false, // Set to true if HAF requires SSL
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export type HafAccount = {
  name: string;
  hbd: string;
  hbd_savs: string;
  account_auths: any;
};

export async function GET() {
  try {
    if (!process.env.HAF_CONNECTION_STRING) {
      console.error('HAF_CONNECTION_STRING is not defined in environment variables');
      return NextResponse.json(
        { error: 'Database configuration missing' },
        { status: 500 }
      );
    }

    // Execute the query to get accounts with 'innopay' in their active authorities
    const query = `
      SELECT
        a.name,
        b.hbd,
        b.hbd_savs,
        a.active->'account_auths' as account_auths
      FROM hafsql.accounts a
      INNER JOIN hafsql.balances b ON b.account_id = a.id
      WHERE a.active @> '{"account_auths": [["innopay", 1]]}'::jsonb
      ORDER BY hbd DESC
    `;

    console.log('Executing HAF query for innopay accounts...');
    const result = await pool.query(query);

    console.log(`Query returned ${result.rows.length} accounts`);

    return NextResponse.json(
      {
        accounts: result.rows,
        count: result.rows.length
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error querying HAF database:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch accounts from HAF database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
