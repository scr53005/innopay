// app/api/verify/request-code/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import prisma from '@/lib/prisma';
import { validateHiveAccountName } from '@/lib/hive-account-name';
import { createVerificationLogger, verificationSnapshot } from '@/lib/verification-diagnostics';
import { buildVerificationEmail, Language } from '@/lib/email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);

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
 * POST /api/verify/request-code
 * Request a verification code to import an existing account
 *
 * Body: { email: string, language?: 'en' | 'fr' | 'de' | 'lb' }
 *
 * Flow:
 * 1. Check if email exists in innouser.email OR email_verification history
 * 2. If not found: return { found: false }
 * 3. If found: Generate code, send email, create verification record
 *
 * Rate limiting:
 * - Max 5 codes per email per hour
 * - 60 second cooldown between requests for same email
 */
export async function POST(req: NextRequest) {
  try {
    const { email, language, accountName } = await req.json();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400, headers: corsHeaders }
      );
    }

    const requestedAccount = typeof accountName === 'string' ? accountName.trim().replace(/^@/, '').toLowerCase() : '';
    if ((accountName != null && typeof accountName !== 'string') ||
        (requestedAccount && !validateHiveAccountName(requestedAccount).valid)) {
      return NextResponse.json({ error: 'Invalid Hive account name' }, { status: 400, headers: corsHeaders });
    }
    const sanitizedEmail = email.trim().toLowerCase();
    const lang = (language || 'en') as Language;

    const trace = createVerificationLogger(sanitizedEmail, req);
    trace('request_started');

    // STEP 1: Find user_id by email (check current email OR historical verifications)
    let userId: number | null = null;

    if (requestedAccount) {
      // An email may own several wallets: resolve the requested account and its
      // CURRENT innouser email together before sending any verification code.
      const linkedWallet = await prisma.walletuser.findFirst({
        where: { accountName: requestedAccount, innouser: { is: { email: sanitizedEmail } } },
        select: { userId: true },
      });
      if (!linkedWallet?.userId) {
        return NextResponse.json({ found: false, manualImport: true }, { headers: corsHeaders });
      }
      userId = linkedWallet.userId;
    } else {
      // Option A: Check current innouser.email
      const userByCurrent = await prisma.innouser.findUnique({
        where: { email: sanitizedEmail }
      });

      if (userByCurrent) {
        userId = userByCurrent.id;
        console.log(`[VERIFY REQUEST] Found user by current email: user_id=${userId}`);
      } else {
        // Option B: Check email_verification history
        const verifiedRecord = await prisma.email_verification.findFirst({
          where: {
            email: sanitizedEmail,
            verified: true
          },
          orderBy: {
            verified_at: 'desc' // Most recent verification
          }
        });

        if (verifiedRecord) {
          userId = verifiedRecord.user_id;
          console.log(`[VERIFY REQUEST] Found user by verification history: user_id=${userId}`);
        }
      }

    }

    // If email not found anywhere
    if (userId === null) {
      console.log(`[VERIFY REQUEST] Email not found: ${sanitizedEmail}`);
      return NextResponse.json({ found: false, manualImport: true }, { headers: corsHeaders });
    }

    // STEP 2: Rate limiting - check recent verification requests
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await prisma.email_verification.count({
      where: {
        email: sanitizedEmail,
        created_at: { gte: oneHourAgo }
      }
    });

    if (recentRequests >= 5) {
      console.warn(`[VERIFY REQUEST] Rate limit exceeded for ${sanitizedEmail}`);
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: corsHeaders }
      );
    }

    // Check cooldown (60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const veryRecentRequest = await prisma.email_verification.findFirst({
      where: {
        email: sanitizedEmail,
        created_at: { gte: sixtySecondsAgo }
      },
      orderBy: { created_at: 'desc' }
    });

    if (veryRecentRequest) {
      const secondsRemaining = Math.ceil((veryRecentRequest.created_at.getTime() + 60000 - Date.now()) / 1000);
      console.warn(`[VERIFY REQUEST] Cooldown active for ${sanitizedEmail}, ${secondsRemaining}s remaining`);
      return NextResponse.json(
        { error: `Please wait ${secondsRemaining} seconds before requesting another code.` },
        { status: 429, headers: corsHeaders }
      );
    }

    // STEP 3: Generate 6-digit code
    const code = Math.floor(Math.random() * 900000 + 100000).toString();

    // STEP 4: Create verification record
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const verificationRecord = await prisma.email_verification.create({
      data: {
        user_id: userId,
        email: sanitizedEmail,
        code,
        expires_at: expiresAt,
        ip_address: ipAddress.slice(0, 45), // Truncate to fit VARCHAR(45)
      }
    });

    trace('request_created', verificationSnapshot(verificationRecord));

    // STEP 5: Send email via Resend
    const { subject, html, text } = buildVerificationEmail(code, lang);

    try {
      const emailResult = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu',
        to: sanitizedEmail,
        subject,
        html,
        text,
      });

      trace(emailResult.error ? 'request_email_rejected' : 'request_email_sent', verificationSnapshot(verificationRecord));
    } catch (emailError: any) {
      trace('request_email_failed', verificationSnapshot(verificationRecord));
      console.error('[VERIFY REQUEST] Failed to send email', { name: emailError?.name });

      // Delete the verification record since email failed
      await prisma.email_verification.delete({
        where: { id: verificationRecord.id }
      });

      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Success!
    return NextResponse.json({
      found: true,
      message: 'Verification code sent to your email.',
      expiresIn: 600 // 10 minutes in seconds
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('[VERIFY REQUEST] Error', { name: error?.name, code: error?.code });
    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
