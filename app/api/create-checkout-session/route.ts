import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // IMPORTANT: The API version '2025-06-30.basil' is unusual.
  // This is set to resolve a specific TypeScript error in your environment.
  // In a standard Stripe integration, you would typically use the latest stable API version
  // found in Stripe's documentation (e.g., '2024-06-20').
  apiVersion: '2025-06-30.basil',
});

export async function POST(req: NextRequest) {
  const { amount } = await req.json(); // Amount in cents

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount provided.' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Wallet Top-up',
            },
            unit_amount: amount, // Amount in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/cancel`,
    });

    return NextResponse.json({ id: session.id }, { status: 200 });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ message: err.message || 'Internal Server Error' }, { status: 500 });
  }
}