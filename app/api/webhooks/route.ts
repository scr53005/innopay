// app/api/webhooks/route.ts (TEMPORARY MODIFICATION FOR LOCAL TESTING)
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Import functions from our new service modules
import {
  findLastHiveAccount,
  findInnoUserByEmail,
  createNewInnoUserWithTopupAndAccount,
  createTopupForExistingUser,
  updateTxIdForAccount,
  nextAccountName
} from '@/services/database'; 
import { 
  Keychain,
  generateHiveKeys,
  createAndBroadcastHiveAccount,
  findNextAvailableAccountName,
  getSeed,
  transferEuroTokens
} from '@/services/hive';

// Initialize Stripe with your secret key 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  let event: Stripe.Event;
  const buf = await req.text(); // Get the raw body as text
  const sig = req.headers.get('stripe-signature');

  // --- START TEMPORARY MOCKING LOGIC ---
  // For local testing, you can mock the event directly.
  // In production, you MUST use stripe.webhooks.constructEvent.
  try {
    // Attempt to verify if signature is present (for more robust local testing)
    if (sig) {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
      event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } else {
      // If no signature, assume it's a mock request for testing
      console.warn("No Stripe-Signature header found. Assuming this is a mock request for testing.");
      // Construct a mock event object
      event = {
        id: 'evt_mock_checkout_completed_123',
        object: 'event',
        api_version: '2024-06-20',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: 'req_mock_123', idempotency_key: null },
        type: 'checkout.session.completed', // The event type you want to mock
        data: {
          object: {
            id: 'cs_mock_session_123',
            object: 'checkout.session',
            amount_total: 250, // amount in EUR expressed in cents
            currency: 'eur',
            customer_details: {
              email: 'sorin@offchain.lu',
              // ... other customer details as needed
            },
            payment_status: 'paid',
            status: 'complete',
            // ... other properties of a checkout.session object
          } as Stripe.Checkout.Session, // Cast to Stripe.Checkout.Session for type safety
        },
      } as Stripe.Event; // Cast to Stripe.Event for type safety
    }
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }
  // --- END TEMPORARY MOCKING LOGIC ---


  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      console.log('Checkout Session Completed!', checkoutSession.id);
      console.log('Customer Email:', checkoutSession.customer_details?.email);
      console.log('Amount Total:', checkoutSession.amount_total);
      
      const customerEmail = checkoutSession.customer_details?.email;
      const amountInEuro = (checkoutSession.amount_total || 0) / 100;

      if (!customerEmail) {
          console.error("No customer email found in checkout session.");
          return NextResponse.json({ message: "No customer email" }, { status: 400 });
      }

      try {
        // Find existing user or create a new one
        let innoUser = await findInnoUserByEmail(customerEmail);
        let accountName: string;
        let seed: string;

        if (!innoUser) {
          // User is new
          if (amountInEuro >= 30) { // Only create a new user if the amount is greater than or equal to 30 EUR
            console.log(`Creating new user for email: ${customerEmail} topping up with ${amountInEuro} EUR`);

            // Find the last used account number and increment it.
            const lastAccount = await findLastHiveAccount(); // This is retrieved from the database
            console.log("Last Hive account found in the DB: '", lastAccount);
            accountName = await findNextAvailableAccountName(nextAccountName(lastAccount));
            seed = getSeed(accountName);
            console.log(`Webhook generated new Hive account name: ${accountName} and seed: ${seed}`);

            try {
              const hiveTxId = await createAndBroadcastHiveAccount(accountName, seed);
              // If the Hive account creation is successful, update the database
              // Create the user and the related seed/account record in a transaction
              const createdRecords = await createNewInnoUserWithTopupAndAccount(
                customerEmail,
                amountInEuro,
                seed,
                accountName,
                hiveTxId
              );
              innoUser = createdRecords[0]; 

              // Transfer EURO tokens after the account creation transaction is confirmed
              const tokenTxId = await transferEuroTokens(accountName, amountInEuro);
              console.log(`EURO token transfer to ${accountName} with transaction ID: ${tokenTxId}`);              

              return NextResponse.json({
                message: `Successfully created new user: ${customerEmail}`,
                accountName: accountName,
                hiveTxId: hiveTxId,
                euroTokenTxId: tokenTxId,
              }, { status: 201 });
            } catch (hiveError) {
              console.error('Hive account creation failed:', hiveError);
              return NextResponse.json({
                error: `Hive account creation failed for ${customerEmail}: ${hiveError}`
              }, { status: 500 });
            } 
          } else {
            console.error("Only create a new user for amounts greater than or equal to 30 EUR.");
            return NextResponse.json({ message: "Please top up at least 30 € for a new account" }, { status: 200 });
          }

        } else {
          // User already exists, just log the top-up
          console.log(`User with email ${customerEmail} already exists. Logging top-up of ${amountInEuro} EUR.`);
          
          if (!innoUser.bip39seedandaccount) {
            // Handle case where user exists but no seed/account was created
            console.error(`User ${innoUser.id} exists but has no seed/account. This should not happen.`);
            return NextResponse.json({ message: "User exists but is not fully provisioned." }, { status: 500 });
          }

          // Create just a new top-up record for the existing user
          await createTopupForExistingUser(innoUser.id, amountInEuro);
          
          accountName = innoUser.bip39seedandaccount.accountName;
          seed = innoUser.bip39seedandaccount.seed
          console.log(`Using existing account name: ${accountName} and seed for user ${seed}`);

          // const userKeychain = generateHiveKeys(accountName, innoUser.bip39seedandaccount.seed);
          // console.log(`Regenerated keychain for user: ${customerEmail}`, userKeychain);

          // Transfer EURO tokens after the account creation transaction is confirmed
          const tokenTxId = await transferEuroTokens(accountName, amountInEuro);
          console.log(`EURO token transfer to ${accountName} with transaction ID: ${tokenTxId}`);          

          return NextResponse.json({
            message: `Successfully topped up existing user: ${customerEmail}`,
            userId: innoUser.id,
          }, { status: 200 });
        }
      } catch (error: any) {
        console.error('Error processing checkout session (business process failed):', error);
        return NextResponse.json({ message: 'Business process failed' }, { status: 500 });
      }
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Mocked Payment Intent Succeeded!', paymentIntent.id);
      // Then define and call a method to handle the successful payment intent.
      // handlePaymentIntentSucceeded(paymentIntent);
      break;
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      // Then define and call a method to handle the successful attachment of a PaymentMethod.
      // handlePaymentMethodAttached(paymentMethod);
      break;      
    default:
      console.warn(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return NextResponse.json({ received: true }, { status: 200 });
}