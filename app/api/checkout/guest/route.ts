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
  const origin = req.headers.get('origin') || '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24 hours
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
      const origin = req.headers.get('origin') || '*';
      return NextResponse.json(
        { error: 'Missing required fields: amountEuro, recipient, memo' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': origin,
          },
        }
      );
    }

    // Determine base URL from request or environment (for fallback)
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

    // Determine success URL (from request or default to Innopay)
    let successUrl: string;
    let cancelUrl: string;
    if (returnUrl) {
      // Build success URL with Stripe template variable
      // IMPORTANT: Do NOT use searchParams.set for {CHECKOUT_SESSION_ID} — it URL-encodes
      // the curly braces (%7B/%7D) which prevents Stripe from recognizing the template variable
      const successParsed = new URL(returnUrl);
      successParsed.searchParams.set('payment', 'success');
      const successBase = successParsed.toString();
      const separator = successBase.includes('?') ? '&' : '?';
      successUrl = `${successBase}${separator}session_id={CHECKOUT_SESSION_ID}`;

      const cancelParsed = new URL(returnUrl);
      cancelParsed.searchParams.set('payment', 'cancelled');
      cancelUrl = cancelParsed.toString();
    } else {
      successUrl = `${baseUrl}/guest/success?session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${baseUrl}/cancel`;
    }

    console.log('[GUEST CHECKOUT API] Success URL:', successUrl);

    // Validate amount
    if (amountEuro <= 0) {
      const origin = req.headers.get('origin') || '*';
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': origin,
          },
        }
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
        flow: 'guest_checkout',
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

    const origin = req.headers.get('origin') || '*';
    return NextResponse.json(
      {
        sessionId: session.id,
        url: session.url,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );

  } catch (error: any) {
    console.error('[GUEST CHECKOUT API] Error creating session:', error);
    console.error('[GUEST CHECKOUT API] Error stack:', error.stack);
    const origin = req.headers.get('origin') || '*';
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}
