'use server';

// Server Action to fetch account credentials from database
// This runs ONLY on the server, never exposed as HTTP endpoint

import prisma from '@/lib/prisma';
import { PrivateKey } from '@hiveio/dhive';

interface CredentialsResult {
  success: boolean;
  source?: 'credential_session' | 'walletuser';
  accountName?: string;
  masterPassword?: string;
  activePrivate?: string;
  activePublic?: string;
  postingPrivate?: string;
  postingPublic?: string;
  memoPrivate?: string;
  memoPublic?: string;
  euroBalance?: number;
  error?: string;
}

/**
 * Server Action: Fetch account credentials from database
 *
 * This function runs ONLY on the server and is not exposed as an HTTP endpoint.
 * It can only be called from React components within the innopay app.
 *
 * Strategy:
 * 1. First try accountCredentialSession (has all keys ready, even if expired)
 * 2. If not found, try walletuser (has masterPassword, derive keys)
 */
export async function getAccountCredentials(accountName: string): Promise<CredentialsResult> {
  if (!accountName) {
    return { success: false, error: 'Missing accountName' };
  }

  console.log(`[SERVER ACTION] Fetching credentials for account: ${accountName}`);

  try {
    // STEP 1: Try accountCredentialSession first (most complete)
    const credentialSession = await prisma.accountCredentialSession.findFirst({
      where: { accountName },
      orderBy: { createdAt: 'desc' }, // Get most recent, even if expired
    });

    if (credentialSession) {
      console.log(`[SERVER ACTION] Found credential session for ${accountName} (source: credential_session)`);

      return {
        success: true,
        source: 'credential_session',
        accountName,
        masterPassword: credentialSession.masterPassword || '',
        activePrivate: credentialSession.activePrivate || '',
        activePublic: credentialSession.activePublic || '',
        postingPrivate: credentialSession.postingPrivate || '',
        postingPublic: credentialSession.postingPublic || '',
        memoPrivate: credentialSession.memoPrivate || '',
        memoPublic: credentialSession.memoPublic || '',
        euroBalance: parseFloat(credentialSession.euroBalance.toString()) || 0,
      };
    }

    // STEP 2: Try walletuser table (has masterPassword, derive keys)
    console.log(`[SERVER ACTION] No credential session found, checking walletuser table`);

    const walletUser = await prisma.walletuser.findUnique({
      where: { accountName },
    });

    if (!walletUser || !walletUser.masterPassword) {
      console.log(`[SERVER ACTION] Account ${accountName} not found or has no masterPassword`);
      return {
        success: false,
        error: 'Account not found in database'
      };
    }

    console.log(`[SERVER ACTION] Found walletuser for ${accountName}, deriving keys from masterPassword (source: walletuser)`);

    // Derive keys from masterPassword
    const masterPassword = walletUser.masterPassword;
    const activePrivate = PrivateKey.fromLogin(accountName, masterPassword, 'active');
    const activePublic = activePrivate.createPublic().toString();
    const postingPrivate = PrivateKey.fromLogin(accountName, masterPassword, 'posting');
    const postingPublic = postingPrivate.createPublic().toString();
    const memoPrivate = PrivateKey.fromLogin(accountName, masterPassword, 'memo');
    const memoPublic = memoPrivate.createPublic().toString();

    return {
      success: true,
      source: 'walletuser',
      accountName,
      masterPassword,
      activePrivate: activePrivate.toString(),
      activePublic,
      postingPrivate: postingPrivate.toString(),
      postingPublic,
      memoPrivate: memoPrivate.toString(),
      memoPublic,
      euroBalance: 0, // Will be fetched separately
    };

  } catch (error: any) {
    console.error(`[SERVER ACTION] Error fetching credentials for ${accountName}:`, error);
    return {
      success: false,
      error: `Failed to fetch credentials: ${error.message}`
    };
  }
}
