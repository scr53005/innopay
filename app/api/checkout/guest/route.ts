// app/api/checkout/guest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { convertHbdToEur } from '@/services/currency';
import { createGuestCheckout } from '@/services/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * POST /api/checkout/guest
 * Creates a Stripe checkout session for guest payments (no account creation)
 * Body: {
 *   hbdAmount: number,
 *   eurUsdRate: number,
 *   recipient: string,
 *   memo: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { hbdAmount, eurUsdRate, recipient, memo } = await req.json();

    // Validate required fields
    if (!hbdAmount || !eurUsdRate || !recipient || !memo) {
      return NextResponse.json(
        { error: 'Missing required fields: hbdAmount, eurUsdRate, recipient, memo' },
        { status: 400 }
      );
    }

    // Validate amounts
    if (hbdAmount <= 0 || eurUsdRate <= 0) {
      return NextResponse.json(
        { error: 'Amounts must be greater than 0' },
        { status: 400 }
      );
    }

    // Convert HBD to EUR using the provided rate
    // HBD ≈ USD, so to convert to EUR we divide by the EUR/USD rate
    const amountEuro = convertHbdToEur(hbdAmount, eurUsdRate);
    const amountCents = Math.round(amountEuro * 100); // Convert to cents for Stripe

    console.log(`Guest checkout: ${hbdAmount} HBD → ${amountEuro.toFixed(2)} EUR (rate: ${eurUsdRate})`);

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
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/guest/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/cancel`,
      metadata: {
        flow: 'guest',
        hbdAmount: hbdAmount.toString(),
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

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error: any) {
    console.error('Error creating guest checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
