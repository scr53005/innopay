import { NextRequest, NextResponse } from 'next/server';
import { getPostingKey, updateHiveAccountMetadata } from '@/services/hive'; // New function in services/hive.ts
import { DbMetadata, setWalletUserMetadata } from '@/services/database';
// import { getKeychainFromLocalStorage } from '../../../utils/keychain'; // Assume helper to load keychain from localStorage (adapt as needed)

export async function POST(request: NextRequest) {
  try {
    const { accountName, masterKey, metadata } = await request.json();

    if (!accountName || !masterKey || !metadata) {
      return NextResponse.json({ error: 'Missing accountName or masterKey or metadata' }, { status: 400 });
    }

    let dbMetadata: DbMetadata;
    dbMetadata = {
      name: metadata.name || '',
      about: metadata.about || '',
      location: metadata.location || '',
      website: metadata.website || '',
      avatarUri: metadata.avatarUri || '',
      backgroundUri: metadata.backgroundUri || '',
    };
    await setWalletUserMetadata(accountName, dbMetadata);
    
    // Load keychain (adapt based on your localStorage structure)
    const posting = getPostingKey(accountName, masterKey); // Returns posting key

    const result = await updateHiveAccountMetadata(accountName, posting, metadata);

    return NextResponse.json({ 
      success: true, 
      transactionId: result.txid,
      metadata: result.metadata // Echo back for confirmation
    }, { status: 200 });
  } catch (error: any) {
    console.error('Hive update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update account' }, { status: 500 });
  }
}