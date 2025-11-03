// app/api/checkout/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * POST /api/checkout/account
 * Creates a Stripe checkout session for account creation with top-up
 * Body: {
 *   accountName: string,
 *   amount: number,  // EUR amount
 *   email?: string,  // Optional customer email
 *   hbdTransfer?: {  // Optional: if coming from indiesmenu order
 *     recipient: string,
 *     hbdAmount: number,
 *     eurUsdRate: number,
 *     memo: string
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { accountName, amount, email, hbdTransfer } = await req.json();

    // Validate required fields
    if (!accountName || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: accountName, amount' },
        { status: 400 }
      );
    }

    // Validate account name format (basic Hive rules)
    if (accountName.length < 3 || accountName.length > 16) {
      return NextResponse.json(
        { error: 'Account name must be between 3 and 16 characters' },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9\-\.]+$/.test(accountName)) {
      return NextResponse.json(
        { error: 'Account name can only contain lowercase letters, numbers, hyphens, and dots' },
        { status: 400 }
      );
    }

    // Validate minimum amount (30 EUR)
    if (amount < 30) {
      return NextResponse.json(
        { error: 'Minimum top-up amount is 30 EUR for account creation' },
        { status: 400 }
      );
    }

    const amountCents = Math.round(amount * 100); // Convert to cents for Stripe

    console.log(`Account creation checkout: ${accountName}, amount: ${amount} EUR`);

    // Prepare metadata
    const metadata: any = {
      flow: 'account_creation',
      accountName,
    };

    // Add HBD transfer info if provided (for indiesmenu orders)
    if (hbdTransfer) {
      metadata.hbdTransfer = JSON.stringify(hbdTransfer);
    }

    // Create Stripe checkout session
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Innopay Account Creation & Top-up',
              description: `Create Hive account "${accountName}" and top-up with ${amount} EUR`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/user/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cancel`,
      metadata,
    };

    // Add customer email if provided
    if (email) {
      sessionConfig.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log(`Created account creation session: ${session.id} for ${accountName}`);

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Error creating account checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
