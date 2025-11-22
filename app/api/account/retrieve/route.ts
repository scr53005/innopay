// app/api/account/retrieve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/account/retrieve
 * Retrieves account credentials by email address
 * Body: { email: string }
 * Returns: { accountName, masterPassword, keys?: { active, posting, memo } }
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    console.log(`[ACCOUNT RETRIEVE] Request for email: ${email}`);

    // Validate email format
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Sanitize email (trim and lowercase)
    const sanitizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await prisma.innouser.findUnique({
      where: { email: sanitizedEmail },
      include: {
        walletuser: true, // Include related walletuser records
      }
    });

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (!user) {
      console.log(`[ACCOUNT RETRIEVE] No user found for email: ${sanitizedEmail}`);
      return NextResponse.json(
        { found: false },
        { status: 200, headers: corsHeaders }
      );
    }

    // Check if user has walletuser records
    if (!user.walletuser || user.walletuser.length === 0) {
      console.log(`[ACCOUNT RETRIEVE] User found but no wallet accounts for: ${sanitizedEmail}`);
      return NextResponse.json(
        { found: false },
        { status: 200, headers: corsHeaders }
      );
    }

    // Get the first (or most recent) walletuser record
    const walletUser = user.walletuser[0];

    if (!walletUser.accountName || !walletUser.masterPassword) {
      console.log(`[ACCOUNT RETRIEVE] Wallet account incomplete for: ${sanitizedEmail}`);
      return NextResponse.json(
        { found: false },
        { status: 200, headers: corsHeaders }
      );
    }

    console.log(`[ACCOUNT RETRIEVE] Found account: ${walletUser.accountName}`);

    // Base response with accountName and masterPassword
    const response: {
      found: boolean;
      accountName: string;
      masterPassword: string;
      keys?: {
        active: string;
        posting: string;
        memo: string;
      };
    } = {
      found: true,
      accountName: walletUser.accountName,
      masterPassword: walletUser.masterPassword,
    };

    // Try to get additional keys from account_credential_session
    try {
      const credentialSession = await prisma.accountCredentialSession.findFirst({
        where: {
          accountName: walletUser.accountName,
          expiresAt: {
            gt: new Date(), // Not expired
          }
        },
        orderBy: {
          createdAt: 'desc' // Get most recent
        }
      });

      if (credentialSession) {
        console.log(`[ACCOUNT RETRIEVE] Found credential session for: ${walletUser.accountName}`);
        response.keys = {
          active: credentialSession.activePrivate,
          posting: credentialSession.postingPrivate,
          memo: credentialSession.memoPrivate,
        };
      } else {
        console.log(`[ACCOUNT RETRIEVE] No valid credential session found for: ${walletUser.accountName}`);
      }
    } catch (error) {
      console.error('[ACCOUNT RETRIEVE] Error fetching credential session:', error);
      // Continue without keys - at least we have accountName and masterPassword
    }

    return NextResponse.json(response, {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error: any) {
    console.error('[ACCOUNT RETRIEVE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}
