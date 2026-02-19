// app/api/verify/get-credentials/route.ts
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

/**
 * POST /api/verify/get-credentials
 * Get full credentials for a specific account name (after verification)
 *
 * Body: { accountName: string, email: string }
 *
 * Security: Only works if email was recently verified (within last 15 minutes)
 */
export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid or empty request body' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { accountName, email } = body;

    // Validate inputs
    if (!accountName || !email) {
      return NextResponse.json(
        { error: 'Account name and email are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const sanitizedEmail = email.trim().toLowerCase();

    console.log(`[GET CREDENTIALS] Account: ${accountName}, Email: ${sanitizedEmail}`);

    // Check if email was recently verified (within last 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const recentVerification = await prisma.email_verification.findFirst({
      where: {
        email: sanitizedEmail,
        verified: true,
        verified_at: { gte: fifteenMinutesAgo }
      },
      orderBy: { verified_at: 'desc' }
    });

    if (!recentVerification) {
      console.warn(`[GET CREDENTIALS] No recent verification found for ${sanitizedEmail}`);
      return NextResponse.json(
        { error: 'Verification expired. Please verify your email again.' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get walletuser record
    const walletuser = await prisma.walletuser.findFirst({
      where: {
        accountName: accountName,
        userId: recentVerification.user_id
      }
    });

    if (!walletuser) {
      console.warn(`[GET CREDENTIALS] Account ${accountName} not found for user_id=${recentVerification.user_id}`);
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Derive keys from masterPassword if available
    let keys = null;
    if (walletuser.masterPassword) {
      const { PrivateKey } = await import('@hiveio/dhive');

      keys = {
        active: PrivateKey.fromSeed(`${accountName}active${walletuser.masterPassword}`).toString(),
        posting: PrivateKey.fromSeed(`${accountName}posting${walletuser.masterPassword}`).toString(),
        memo: PrivateKey.fromSeed(`${accountName}memo${walletuser.masterPassword}`).toString()
      };
    }

    console.log(`[GET CREDENTIALS] Returning credentials for ${accountName}`);

    return NextResponse.json({
      accountName: walletuser.accountName,
      masterPassword: walletuser.masterPassword,
      keys
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('[GET CREDENTIALS] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get credentials',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
