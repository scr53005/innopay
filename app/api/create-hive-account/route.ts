// app/api/create-hive-account/route.ts

import { NextResponse } from 'next/server';
import { createAndBroadcastHiveAccount, Keychain } from '@/services/hive';

export async function POST(request: Request) {
  try {
    const { accountName, keychain } = await request.json();

    if (!accountName || !keychain) {
      return NextResponse.json({ error: 'Missing accountName or keychain.' }, { status: 400 });
    }

    const transactionId = await createAndBroadcastHiveAccount(accountName, keychain);

    return NextResponse.json({ transactionId });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}