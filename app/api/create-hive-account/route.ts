// app/api/create-hive-account/route.ts

import { NextResponse } from 'next/server';
import { accountExists, getSeed, generateHiveKeys, createAndBroadcastHiveAccount  } from '@/services/hive';

export async function POST(request: Request) {
  try {
    const { accountName, mockBroadcast, simulateClaimedFailure } = await request.json();

    if (!accountName || typeof accountName !== 'string') {
      return NextResponse.json({ error: 'Missing accountName' }, { status: 400 });
    }
    console.log('Received request to create Hive account:', accountName);
    
    // Check account existence on the server side
    const exists = await accountExists(accountName);
    if (exists) {
      return NextResponse.json({ 
        error: "This account exists already. You'll need to pick a different account name as account names are unique." 
      }, { status: 409 }); // 409 Conflict status code is appropriate here.
    } else {
      console.log(`Account name ${accountName} appears available.`);
    }

    // Generate seed and keys on the server side for security
    const seed = getSeed(accountName);
    console.log(`Generated seed for account ${accountName}: ${seed}`);
    const keychain = generateHiveKeys(accountName, seed);
    // console.log(`Generated keychain for account ${accountName}:`, keychain);

    // Create and broadcast the Hive account, returning the transaction ID      
    const transactionId = await createAndBroadcastHiveAccount(accountName, keychain, {
      mockBroadcast: !!mockBroadcast, // Ensure boolean
      simulateClaimedFailure: !!simulateClaimedFailure, // Ensure boolean
    });
    console.log(`Hive account ${accountName} created with transaction ID: ${transactionId}`);

    // Return the generated data to the client for the user to save
    return NextResponse.json({
      accountName,
      transactionId,
      seed,
      masterPassword: keychain.masterPassword,
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}