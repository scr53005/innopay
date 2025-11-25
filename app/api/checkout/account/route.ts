// app/api/checkout/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

/**
 * POST /api/checkout/account
 * Creates a Stripe checkout session for account creation OR top-up
 * Body: {
 *   flow: 'account_creation' | 'topup',  // Flow type (default: 'account_creation')
 *   accountName: string,
 *   amount: number,  // EUR amount (default/suggested)
 *   email?: string,  // Optional customer email
 *   campaign?: {     // Optional: active campaign info (only for account_creation flow)
 *     id: number,
 *     name: string,
 *     minAmount50: number,
 *     bonus50: number,
 *     remainingSlots50: number,
 *     minAmount100: number,
 *     bonus100: number,
 *     remainingSlots100: number
 *   },
 *   orderAmountEuro?: number,  // Optional: if coming from indiesmenu order
 *   orderMemo?: string  // Optional: memo for restaurant transfer
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { flow = 'account_creation', accountName, amount, email, campaign, orderAmountEuro, orderMemo, redirectParams } = await req.json();

    console.log(`[${new Date().toISOString()}] [CHECKOUT API] Received request:`, {
      flow,
      accountName,
      amount,
      orderAmountEuro,
      orderMemo,
      orderMemoLength: orderMemo?.length,
      redirectParams
    });

    // Validate required fields
    if (!accountName || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: accountName, amount' },
        { status: 400 }
      );
    }

    // Determine base URL from request or environment
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;
    console.log(`[${new Date().toISOString()}] [CHECKOUT API] Using base URL: ${baseUrl}`);

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

    // Validate minimum amount (TEMP: reduced for testing - was 30 EUR for account creation, 15 EUR for top-up)
    const minAmount = flow === 'topup' ? 15 : 3;
    if (amount < minAmount) {
      return NextResponse.json(
        { error: `Minimum amount is ${minAmount} EUR for ${flow === 'topup' ? 'top-up' : 'account creation'}` },
        { status: 400 }
      );
    }

    const amountCents = Math.round(amount * 100); // Convert to cents for Stripe

    console.log(`Account creation checkout: ${accountName}, amount: ${amount} EUR`);

    // Prepare metadata
    const metadata: any = {
      flow,
      accountName,
    };

    // Add campaign ID if provided (to track bonus eligibility)
    if (campaign) {
      metadata.campaignId = campaign.id.toString();
    }

    // Add order info if provided (for indiesmenu orders)
    if (orderAmountEuro) {
      metadata.orderAmountEuro = orderAmountEuro.toString();
      metadata.orderMemo = orderMemo || 'Table order';
      console.log(`[${new Date().toISOString()}] [CHECKOUT API] Adding order metadata:`, {
        orderAmountEuro: metadata.orderAmountEuro,
        orderMemo: metadata.orderMemo,
        memoLength: metadata.orderMemo.length
      });
      if (!orderMemo) {
        console.warn(`[${new Date().toISOString()}] [CHECKOUT API] ⚠️ WARNING: No orderMemo provided, using fallback 'Table order'`);
      }
    }

    // Build product name and description based on flow type
    let productName: string;
    let productDescription: string;

    if (flow === 'topup') {
      // Top-up flow: No campaign bonuses for returning users
      productName = 'Innopay Account Top-up';
      productDescription = `Top-up Innopay account "${accountName}" with ${amount} EUR`;
    } else {
      // Account creation flow: Include campaign bonuses
      productName = 'Innopay Account Creation & Top-up';
      productDescription = `Create Innopay account "${accountName}" and top-up with ${amount} EUR `;
      productDescription += `\n\n Please provide a valid e-mail during checkout to receive account details. `;

      if (campaign) {
        productDescription += `\n\n 🎁 ${campaign.name}`;

        if (campaign.remainingSlots50 > 0) {
          productDescription += `\n • Pay ${campaign.minAmount50}€ or more → Get ${campaign.bonus50}€ bonus (${campaign.remainingSlots50} slots left)`;
        }

        if (campaign.remainingSlots100 > 0) {
          productDescription += `\n • Pay ${campaign.minAmount100}€ or more → Get ${campaign.bonus100}€ bonus (${campaign.remainingSlots100} slots left)`;
        }
      }
    }

    // Create Stripe checkout session with custom amount enabled
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
          adjustable_quantity: {
            enabled: false, // Disable quantity adjustment
          },
        },
      ],
      mode: 'payment',
      // Allow custom amounts (minimum 30€)
      payment_intent_data: {
        setup_future_usage: undefined,
      },
      success_url: redirectParams?.orderAmount
        ? `${baseUrl.replace('wallet.innopay.lu', 'menu.indiesmenu.lu').replace('localhost:3000', 'localhost:3001')}/?${redirectParams.table ? `table=${redirectParams.table}&` : ''}topup_success=true`
        : flow === 'topup'
          ? `${baseUrl}/?topup_success=true&session_id={CHECKOUT_SESSION_ID}`
          : `${baseUrl}/user/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: redirectParams?.orderAmount
        ? `${baseUrl.replace('wallet.innopay.lu', 'menu.indiesmenu.lu').replace('localhost:3000', 'localhost:3001')}/?${redirectParams.table ? `table=${redirectParams.table}&` : ''}cancelled=true`
        : flow === 'topup'
          ? `${baseUrl}/?cancelled=true`
          : `${baseUrl}/user?cancelled=true`,
      metadata,
    };

    // Log the URLs being used
    console.log(`[${new Date().toISOString()}] [CHECKOUT API] Success URL:`, sessionConfig.success_url);
    console.log(`[${new Date().toISOString()}] [CHECKOUT API] Cancel URL:`, sessionConfig.cancel_url);

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
