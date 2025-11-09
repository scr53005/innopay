// app/api/checkout/guest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { convertEurToHbd, getEurUsdRateServerSide } from '@/services/currency';
import { createGuestCheckout } from '@/services/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

// Handle CORS preflight
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * POST /api/checkout/guest
 * Creates a Stripe checkout session for guest payments (no account creation)
 * Body: {
 *   amountEuro: number,  // Cart total in EUR (from indiesmenu)
 *   recipient: string,   // Hive account to receive payment (e.g., 'indies.cafe')
 *   memo: string         // Custom encoded memo from indiesmenu (pass through untouched)
 *   returnUrl?: string   // Optional URL to redirect after success (defaults to Innopay success page)
 * }
 */
export async function POST(req: NextRequest) {
  console.log('[GUEST CHECKOUT API] Request received');

  try {
    const body = await req.json();
    console.log('[GUEST CHECKOUT API] Request body:', body);

    const { amountEuro, recipient, memo, returnUrl } = body;

    // Validate required fields
    if (!amountEuro || !recipient || !memo) {
      return NextResponse.json(
        { error: 'Missing required fields: amountEuro, recipient, memo' },
        { status: 400 }
      );
    }

    // Determine success URL (from request or default to Innopay)
    const successUrl = returnUrl
      ? `${returnUrl}&payment=success&session_id={CHECKOUT_SESSION_ID}`
      : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/guest/success?session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = returnUrl
      ? `${returnUrl}&payment=cancelled`
      : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cancel`;

    console.log('[GUEST CHECKOUT API] Success URL:', successUrl);

    // Validate amount
    if (amountEuro <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Fetch EUR/USD rate server-side
    const { conversion_rate: eurUsdRate } = await getEurUsdRateServerSide();

    // Convert EUR to HBD (HBD ≈ USD)
    const hbdAmount = convertEurToHbd(amountEuro, eurUsdRate);
    const amountCents = Math.round(amountEuro * 100); // Convert to cents for Stripe

    console.log(`Guest checkout: ${amountEuro.toFixed(2)} EUR → ${hbdAmount.toFixed(3)} HBD (rate: ${eurUsdRate})`);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Order Payment',
              description: `Payment for order at ${recipient}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        flow: 'guest',
        amountEuro: amountEuro.toString(),
        hbdAmount: hbdAmount.toFixed(3),
        recipient,
        memo,
      },
    });

    // Create guest checkout record in database
    await createGuestCheckout(
      session.id,
      amountEuro,
      hbdAmount,
      recipient,
      memo
    );

    console.log(`Created guest checkout session: ${session.id}`);

    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );

  } catch (error: any) {
    console.error('[GUEST CHECKOUT API] Error creating session:', error);
    console.error('[GUEST CHECKOUT API] Error stack:', error.stack);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
