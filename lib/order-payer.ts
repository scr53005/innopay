import prisma from './prisma';
import { orderReference } from './order-reference';

// Records who paid an order (table order_payer). Two readers:
// - the spokes' customer photos (DISH-PHOTOS-PLAN.md §4, GET /api/orders/payer): a wallet order
//   reaches the restaurant from @innopay, so only the hub knows the customer;
// - the CRM (CRM-PLAN.md §8): who ordered what, when, for how much. For Flows 5 and 7 (card) no
//   customer transfer carries the reference on the chain, so this row is the only link.
// Called by every path that pays a restaurant for a customer's wallet: /api/wallet-payment
// (Flow 6), the Stripe webhook (Flows 5 and 7), /api/execute-order-payment.
// Never throws: a missing row costs a photo prompt and a CRM line, never the order.

export type OrderPayerPath = 'wallet' | 'stripe' | 'direct';

export interface OrderPayerInput {
  recipient: string;
  memo: string | null | undefined;
  customerAccount: string | null | undefined;
  path: OrderPayerPath;
  /** Fiat charged, tip included. */
  orderTotal: number;
  /** The spoke's fiat: 'EUR', 'RON'… */
  fiat: string;
}

export async function recordOrderPayer(input: OrderPayerInput): Promise<void> {
  const reference = orderReference(input.memo);
  if (!reference || !input.customerAccount) return; // waiter call, or guest (no wallet)
  const orderKey = `order:${input.recipient}:${reference}`.slice(0, 80);
  try {
    await prisma.order_payer.upsert({
      where: { order_key: orderKey },
      create: {
        order_key: orderKey, reference, customer_account: input.customerAccount, recipient: input.recipient,
        path: input.path, order_total: input.orderTotal, fiat: input.fiat, memo: input.memo ?? null,
      },
      update: {}, // a retried webhook: the first record stands
    });
  } catch (error) {
    console.error(`[ORDER PAYER] could not record ${reference} (@${input.customerAccount}):`, error);
  }
}
