// app/api/verify/check-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// CORS configuration for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface WalletAccount {
  accountName: string;
  creationDate: Date;
  euroBalance: number;
  masterPassword: string | null;
  seed: string | null;
}

/**
 * POST /api/verify/check-code
 * Verify the email verification code and return account credentials
 *
 * Body: { email: string, code: string }
 *
 * Flow:
 * 1. Find most recent pending verification for this email
 * 2. Validate code (max 3 attempts, check expiry)
 * 3. Find PREVIOUS verified_at timestamp for temporal filtering
 * 4. Query walletuser accounts created before previous verification
 * 5. Fetch EURO balance for each account
 * 6. Mark verification as complete
 * 7. Update innouser.verified = true
 * 8. Return accounts (single auto-selected, or multiple for user choice)
 */
export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    // Validate inputs
    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedCode = code.trim();

    console.log(`[VERIFY CHECK] Email: ${sanitizedEmail}, Code: ${sanitizedCode}`);

    // STEP 1: Find most recent pending verification for this email
    const verification = await prisma.email_verification.findFirst({
      where: {
        email: sanitizedEmail,
        verified: false,
        expires_at: { gt: new Date() } // Not expired
      },
      orderBy: { created_at: 'desc' }
    });

    if (!verification) {
      console.warn(`[VERIFY CHECK] No valid verification found for ${sanitizedEmail}`);
      return NextResponse.json(
        { success: false, error: 'No verification code found or code expired. Please request a new code.' },
        { status: 404, headers: corsHeaders }
      );
    }

    // STEP 2: Check if code matches
    if (verification.code !== sanitizedCode) {
      // Increment attempts
      const newAttempts = verification.attempts + 1;

      await prisma.email_verification.update({
        where: { id: verification.id },
        data: { attempts: newAttempts }
      });

      console.warn(`[VERIFY CHECK] Incorrect code for ${sanitizedEmail}, attempt ${newAttempts}/3`);

      // Max 3 attempts
      if (newAttempts >= 3) {
        // Mark as expired (effectively)
        await prisma.email_verification.update({
          where: { id: verification.id },
          data: { expires_at: new Date() } // Set to past
        });

        return NextResponse.json(
          { success: false, error: 'Too many incorrect attempts. Please request a new code.' },
          { status: 429, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: false, error: `Incorrect code. ${3 - newAttempts} attempts remaining.` },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[VERIFY CHECK] Code verified successfully for ${sanitizedEmail}`);

    // STEP 3: Determine temporal cutoff for walletuser filtering
    // Check if email was found in current innouser.email OR in verification history
    const currentUser = await prisma.innouser.findUnique({
      where: { email: sanitizedEmail }
    });

    let walletusers;

    if (currentUser) {
      // Email is CURRENT innouser email - return ALL walletusers for this user
      console.log(`[VERIFY CHECK] Email is current innouser.email - fetching all accounts`);

      walletusers = await prisma.walletuser.findMany({
        where: {
          userId: verification.user_id
        },
        orderBy: { creationDate: 'desc' }
      });
    } else {
      // Email NOT in current innouser - must be from verification history
      // Find PREVIOUS verified_at for temporal filtering
      const previousVerification = await prisma.email_verification.findFirst({
        where: {
          email: sanitizedEmail,
          verified: true,
          id: { not: verification.id } // Exclude current verification
        },
        orderBy: { verified_at: 'desc' }
      });

      if (!previousVerification) {
        // Email has NEVER been verified before - this shouldn't happen
        console.error(`[VERIFY CHECK] Email ${sanitizedEmail} not in innouser and no previous verification found`);
        return NextResponse.json(
          { success: false, error: 'Email verification failed. Please try again.' },
          { status: 404, headers: corsHeaders }
        );
      }

      const temporalCutoff = previousVerification.verified_at!;
      console.log(`[VERIFY CHECK] Email is from history - temporal cutoff: ${temporalCutoff.toISOString()}`);

      // Only return accounts created BEFORE the previous verification
      walletusers = await prisma.walletuser.findMany({
        where: {
          userId: verification.user_id,
          creationDate: { lte: temporalCutoff }
        },
        orderBy: { creationDate: 'desc' }
      });
    }

    console.log(`[VERIFY CHECK] Found ${walletusers.length} walletuser(s) for user_id=${verification.user_id}`);

    if (walletusers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No accounts found for this email.' },
        { status: 404, headers: corsHeaders }
      );
    }

    // STEP 5: Fetch EURO balance for each account from Hive-Engine API
    const accounts: WalletAccount[] = [];

    for (const walletuser of walletusers) {
      let euroBalance = 0;

      try {
        const response = await fetch('https://api.hive-engine.com/rpc/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'find',
            params: {
              contract: 'tokens',
              table: 'balances',
              query: {
                account: walletuser.accountName,
                symbol: 'EURO'
              }
            },
            id: 1
          })
        });

        if (!response.ok) {
          console.warn(`[VERIFY CHECK] Hive-Engine API returned ${response.status} for ${walletuser.accountName}`);
        } else {
          const data = await response.json();

          if (data.result && data.result.length > 0) {
            euroBalance = parseFloat(data.result[0].balance);
          }
        }

        console.log(`[VERIFY CHECK] Account ${walletuser.accountName}: ${euroBalance} EURO`);
      } catch (error) {
        console.error(`[VERIFY CHECK] Failed to fetch balance for ${walletuser.accountName}:`, error);
        // Continue with balance = 0 if API fails
      }

      accounts.push({
        accountName: walletuser.accountName,
        creationDate: walletuser.creationDate,
        euroBalance,
        masterPassword: walletuser.masterPassword,
        seed: walletuser.seed
      });
    }

    // STEP 6: Mark current verification as verified (do this AFTER querying walletusers!)
    await prisma.email_verification.update({
      where: { id: verification.id },
      data: {
        verified: true,
        verified_at: new Date()
      }
    });

    // STEP 7: Update innouser.verified = true
    await prisma.innouser.update({
      where: { id: verification.user_id },
      data: { verified: true }
    });

    console.log(`[VERIFY CHECK] Marked user_id=${verification.user_id} as verified`);

    // STEP 8: Return accounts
    if (accounts.length === 1) {
      // Single account: Auto-select and return full credentials
      const account = accounts[0];

      // Derive keys from masterPassword if available
      let keys = null;
      if (account.masterPassword) {
        const { PrivateKey } = await import('@hiveio/dhive');

        keys = {
          active: PrivateKey.fromSeed(`${account.accountName}active${account.masterPassword}`).toString(),
          posting: PrivateKey.fromSeed(`${account.accountName}posting${account.masterPassword}`).toString(),
          memo: PrivateKey.fromSeed(`${account.accountName}memo${account.masterPassword}`).toString()
        };
      }

      return NextResponse.json({
        success: true,
        single: true,
        accountName: account.accountName,
        masterPassword: account.masterPassword,
        keys
      }, { headers: corsHeaders });

    } else {
      // Multiple accounts: Return list for user to choose
      return NextResponse.json({
        success: true,
        single: false,
        accounts: accounts.map(acc => ({
          accountName: acc.accountName,
          creationDate: acc.creationDate.toISOString(),
          euroBalance: acc.euroBalance
        }))
      }, { headers: corsHeaders });
    }

  } catch (error: any) {
    console.error('[VERIFY CHECK] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify code',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
