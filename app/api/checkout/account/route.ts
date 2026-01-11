// app/api/checkout/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { detectFlow, getRedirectUrl, FLOW_METADATA, type FlowContext } from '@/lib/flows';

const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

// CORS headers for cross-origin requests from indiesmenu
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, set this to specific origin
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

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
 *   orderMemo?: string,  // Optional: memo for restaurant transfer
 *   restaurantAccount?: string  // Optional: restaurant Hive account (defaults to 'indies.cafe')
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const {
      accountName,
      amount,
      email,
      campaign,
      orderAmountEuro,
      orderMemo,
      redirectParams,
      hasLocalStorageAccount,
      accountBalance,
      mockAccountCreation,
      returnUrl,  // Custom return URL for Flow 7 (pay_with_topup)
      restaurantId,  // Spoke ID from database (e.g., 'croque-bedaine', 'indiesmenu')
      restaurantAccount,  // Restaurant Hive account (for hub-and-spokes multi-restaurant)
    } = await req.json();

    // DETECT FLOW using the systematic flow management system
    const flowContext: FlowContext = {
      hasLocalStorageAccount: hasLocalStorageAccount || false,
      accountName,
      table: redirectParams?.table,
      orderAmount: redirectParams?.orderAmount || orderAmountEuro?.toString(),
      orderMemo: redirectParams?.orderMemo || orderMemo,
      topupAmount: amount?.toString(),
      accountBalance,
    };

    const detectedFlow = detectFlow(flowContext);
    const flowMetadata = FLOW_METADATA[detectedFlow];

    // Extract order data from redirectParams for metadata (Flow 7)
    const finalOrderAmountEuro = orderAmountEuro || (redirectParams?.orderAmount ? parseFloat(redirectParams.orderAmount) : undefined);
    const finalOrderMemo = orderMemo || redirectParams?.orderMemo;

    console.log(`[${new Date().toISOString()}] [CHECKOUT API] Flow Detection:`, {
      detectedFlow,
      category: flowMetadata.category,
      description: flowMetadata.description,
      accountName,
      amount,
      orderAmountEuro,
      orderMemo,
      orderMemoLength: orderMemo?.length,
      redirectParams,
    });

    // Validate required fields
    if (!accountName || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: accountName, amount' },
        { status: 400, headers: corsHeaders }
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
        { status: 400, headers: corsHeaders }
      );
    }

    if (!/^[a-z0-9\-\.]+$/.test(accountName)) {
      return NextResponse.json(
        { error: 'Account name can only contain lowercase letters, numbers, hyphens, and dots' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate minimum amount (TEMP: reduced for testing - was 30 EUR for account creation, 15 EUR for top-up)
    const minAmount = detectedFlow === 'topup' ? 15 : 3;
    if (amount < minAmount) {
      return NextResponse.json(
        { error: `Minimum amount is ${minAmount} EUR for ${flowMetadata.category === 'internal' && detectedFlow === 'topup' ? 'top-up' : 'account creation'}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const amountCents = Math.round(amount * 100); // Convert to cents for Stripe

    console.log(`Account creation checkout: ${accountName}, amount: ${amount} EUR`);

    // Prepare metadata with detected flow
    const metadata: any = {
      flow: detectedFlow,  // Use detected flow instead of passed parameter
      flowCategory: flowMetadata.category,
      accountName,
    };

    // Add mock flag if enabled (for dev/test environments)
    if (mockAccountCreation) {
      metadata.mockAccountCreation = 'true';
      console.log(`[${new Date().toISOString()}] [CHECKOUT API] Mock account creation enabled`);
    }

    // Add campaign ID if provided (to track bonus eligibility)
    if (campaign) {
      metadata.campaignId = campaign.id.toString();
    }

    // Add order info if provided (for indiesmenu orders)
    if (finalOrderAmountEuro) {
      // CRITICAL: Order amount without memo is INVALID - restaurant can't match payment to order
      if (!finalOrderMemo || finalOrderMemo.trim() === '') {
        console.error(`[${new Date().toISOString()}] [CHECKOUT API] ❌ CRITICAL ERROR: Order amount ${finalOrderAmountEuro} but NO MEMO!`);
        return NextResponse.json(
          {
            error: 'Invalid order: memo is required when order amount is specified',
            details: 'Cannot process restaurant payment without order memo for order matching',
          },
          { status: 400, headers: corsHeaders }
        );
      }

      metadata.orderAmountEuro = finalOrderAmountEuro.toString();
      metadata.orderMemo = finalOrderMemo;

      // Add restaurant identification for hub-and-spokes multi-restaurant architecture
      // restaurantId: spoke ID from database (defaults to 'indiesmenu' for backward compatibility)
      // restaurantAccount: Hive account for payment recipient (defaults to 'indies.cafe')
      metadata.restaurantId = restaurantId || 'indiesmenu';
      metadata.restaurantAccount = restaurantAccount || 'indies.cafe';

      console.log(`[${new Date().toISOString()}] [CHECKOUT API] Adding order metadata:`, {
        orderAmountEuro: metadata.orderAmountEuro,
        orderMemo: metadata.orderMemo,
        memoLength: metadata.orderMemo.length,
        restaurantId: metadata.restaurantId,
        restaurantAccount: metadata.restaurantAccount
      });
    }

    // Build product name and description based on flow category
    let productName: string;
    let productDescription: string;

    if (flowMetadata.category === 'internal' && detectedFlow === 'topup') {
      // Internal top-up flow
      productName = 'Innopay Account Top-up';
      productDescription = `Top-up Innopay account "${accountName}" with ${amount} EUR`;
    } else if (flowMetadata.category === 'external') {
      // External flow (restaurant)
      productName = 'Innopay Payment';
      productDescription = `Process payment for restaurant order`;
      if (orderAmountEuro) {
        productDescription += ` (Order: ${orderAmountEuro} EUR)`;
      }
    } else {
      // Account creation flows
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

    // Build redirect URLs based on flow type
    let successUrl: string;
    let cancelUrl: string;

    // FLOW 7: If custom returnUrl is provided (pay_with_topup from spoke)
    if (returnUrl) {
      console.log(`[${new Date().toISOString()}] [CHECKOUT API] Using custom returnUrl for Flow 7:`, returnUrl);

      // Append order_success=true to match what the menu page expects
      const separator = returnUrl.includes('?') ? '&' : '?';
      successUrl = `${returnUrl}${separator}order_success=true&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = `${returnUrl}${separator}topup_cancelled=true`;
    }
    // INTERNAL flows (new_account, topup) - stay on innopay hub
    else if (detectedFlow === 'new_account' || detectedFlow === 'topup') {
      successUrl = `${baseUrl}/user/success?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`;
      cancelUrl = `${baseUrl}/user?cancelled=true`;
    }
    // EXTERNAL flows (create_account_only, create_account_and_pay) - redirect to spoke
    else {
      // Look up spoke from database using restaurantId
      const spokeId = restaurantId || 'indiesmenu';
      const spoke = await prisma.spoke.findUnique({
        where: { id: spokeId },
        select: {
          domain_prod: true,
          port_dev: true,
          path: true,
        },
      });

      if (!spoke) {
        console.warn(`[${new Date().toISOString()}] [CHECKOUT API] Spoke not found: ${spokeId}, falling back to indiesmenu`);
      }

      // Build spoke URL based on environment (dev vs prod)
      let spokeUrl: string;
      const isDev = baseUrl.includes('localhost') || /192\.168\.\d+\.\d+/.test(baseUrl);

      if (isDev && spoke) {
        // In dev, use same host as hub but with spoke's port
        const hostMatch = baseUrl.match(/https?:\/\/([^:\/]+)/);
        const host = hostMatch ? hostMatch[1] : 'localhost';
        const protocol = baseUrl.startsWith('https') ? 'https' : 'http';
        spokeUrl = `${protocol}://${host}:${spoke.port_dev}${spoke.path}`;
      } else if (spoke) {
        // In prod, use spoke's domain
        spokeUrl = `https://${spoke.domain_prod}${spoke.path}`;
      } else {
        // Fallback to old hardcoded behavior for backward compatibility
        spokeUrl = baseUrl
          .replace('wallet.innopay.lu', 'indies.innopay.lu')
          .replace('localhost:3000', 'localhost:3001');
        spokeUrl = spokeUrl.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):3000/, '$1:3001');
        if (!spokeUrl.endsWith('/menu')) {
          spokeUrl = `${spokeUrl}/menu`;
        }
      }

      // Build query parameters
      // IMPORTANT: Stripe's {CHECKOUT_SESSION_ID} placeholder must NOT be URL-encoded
      // URLSearchParams.set() would encode it as %7BCHECKOUT_SESSION_ID%7D which Stripe won't replace
      const table = redirectParams?.table;
      const optimisticAmount = detectedFlow === 'create_account_and_pay' && orderAmountEuro
        ? amount - parseFloat(orderAmountEuro.toString())
        : amount;

      // Build success URL manually to preserve unencoded {CHECKOUT_SESSION_ID}
      const successQueryParts: string[] = [];
      if (table) successQueryParts.push(`table=${encodeURIComponent(table)}`);
      successQueryParts.push('topup_success=true');
      successQueryParts.push('session_id={CHECKOUT_SESSION_ID}'); // Must NOT be encoded!
      successQueryParts.push(`amount=${optimisticAmount}`);

      const cancelQueryParts: string[] = [];
      if (table) cancelQueryParts.push(`table=${encodeURIComponent(table)}`);
      cancelQueryParts.push('cancelled=true');

      successUrl = `${spokeUrl}?${successQueryParts.join('&')}`;
      cancelUrl = `${spokeUrl}?${cancelQueryParts.join('&')}`;

      console.log(`[${new Date().toISOString()}] [CHECKOUT API] Built spoke redirect URLs:`, {
        spokeId,
        spoke: spoke ? { domain_prod: spoke.domain_prod, port_dev: spoke.port_dev, path: spoke.path } : 'NOT FOUND',
        isDev,
        spokeUrl,
      });
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
      success_url: successUrl,
      cancel_url: cancelUrl,
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
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('Error creating account checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
