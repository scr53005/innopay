import { NextRequest, NextResponse } from 'next/server';
import { getWalletUserMetadata } from '@/services/database';

export async function POST(req: NextRequest) {
  try {
    const { accountName } = await req.json();

    if (!accountName) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    }

    // This route serves both 'fast' and 'pure' strategies for now.
    // In a future iteration, the 'pure' strategy would query the Hive blockchain directly.
    const metadata = await getWalletUserMetadata(accountName);

    if (!metadata) {
      return NextResponse.json({ metadata: null }, { status: 404 });
    }

    return NextResponse.json({ metadata }, { status: 200 });
  } catch (error) {
    console.error('Error fetching Hive metadata:', error);
    return NextResponse.json({ error: 'Failed to fetch Hive metadata' }, { status: 500 });
  }
}