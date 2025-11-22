// app/api/account/email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/account/email?accountName=xxx
 * Retrieves user email by account name for Stripe pre-fill
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountName = searchParams.get('accountName');

    if (!accountName) {
      return NextResponse.json(
        { error: 'accountName parameter required' },
        { status: 400 }
      );
    }

    console.log(`[EMAIL API] Looking up email for account: ${accountName}`);

    // Find walletuser by accountName
    const walletUser = await prisma.walletuser.findUnique({
      where: { accountName },
      include: {
        innouser: true, // Include linked innouser to get email
      }
    });

    if (!walletUser || !walletUser.innouser) {
      console.log(`[EMAIL API] No email found for account: ${accountName}`);
      return NextResponse.json(
        { found: false },
        { status: 200 }
      );
    }

    console.log(`[EMAIL API] Found email for account: ${accountName}`);
    return NextResponse.json({
      found: true,
      email: walletUser.innouser.email
    }, { status: 200 });

  } catch (error: any) {
    console.error('[EMAIL API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
