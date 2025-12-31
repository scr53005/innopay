// services/payment-processor.ts
// Shared payment processing logic for all flows

import { convertEurToHbd, getEurUsdRateServerSide } from './currency';
import { transferEuroTokens, transferHbd, transferEuroTokensFromAccount, transferHbdFromAccount, getRecipientForEnvironment } from './hive';
import prisma from '@/lib/prisma';

export interface PaymentResult {
  restaurantHbdTxId?: string;
  restaurantEuroTxId?: string;
  customerEuroTxId?: string;
  customerHbdTxId?: string;
  eurUsdRate: number;
}

/**
 * Processes a complete order payment flow:
 * 1. Transfer EURO from customer → innopay (if fromCustomer is true)
 * 2. Transfer HBD/EURO from innopay → restaurant
 * 3. Record debts if HBD transfers fail
 *
 * @param params Payment parameters
 * @returns Transaction IDs and rate information
 */
export async function processOrderPayment(params: {
  customerAccount: string;
  restaurantAccount: string;
  orderAmount: number;
  orderMemo: string;
  fromCustomer?: boolean; // If true, transfer EURO from customer to innopay first
  reason?: string; // For debt tracking (e.g., 'flow5_branch_a', 'flow7_order')
}): Promise<PaymentResult> {
  const { customerAccount, restaurantAccount, orderAmount, orderMemo, fromCustomer = false, reason = 'order_payment' } = params;

  console.log(`[PAYMENT] ========================================`);
  console.log(`[PAYMENT] Processing order payment:`, {
    customerAccount,
    restaurantAccount,
    orderAmount,
    fromCustomer,
    memoLength: orderMemo.length,
    reason
  });

  const result: PaymentResult = {
    eurUsdRate: 1.0
  };

  // STEP 1: Transfer EURO from customer to innopay (if requested)
  // If this fails, record EURO debt and continue - restaurant must still get paid
  if (fromCustomer) {
    console.log(`[PAYMENT] Step 1: Transfer ${orderAmount}€ from ${customerAccount} to innopay`);
    try {
      result.customerEuroTxId = await transferEuroTokensFromAccount(
        customerAccount,
        'innopay',
        orderAmount,
        'Paiement au restaurant / Payment to restaurant'
      );
      console.log(`[PAYMENT] ✅ Customer EURO transferred to innopay: ${result.customerEuroTxId}`);
    } catch (customerEuroError: any) {
      console.error(`[PAYMENT] ❌ Customer EURO transfer failed:`, customerEuroError.message);
      console.log(`[PAYMENT] Recording EURO debt from ${customerAccount} to innopay`);

      // Record EURO debt - customer owes innopay (non-blocking, continue payment)
      try {
        await prisma.outstanding_debt.create({
          data: {
            creditor: 'innopay',
            debtor: customerAccount,
            amount_euro: orderAmount,
            amount_hbd: 0,
            eur_usd_rate: 1.0, // Will update with actual rate below
            reason,
            notes: `EURO transfer failed at ${new Date().toISOString()}: ${customerEuroError.message}`
          }
        });
        console.log(`📝 [DEBT] Recorded ${orderAmount}€ EURO debt from ${customerAccount} to innopay`);
      } catch (debtError) {
        console.error('[PAYMENT] WARNING: Failed to record EURO debt:', debtError);
      }
      // Continue to pay restaurant even if customer transfer failed
    }
  }

  // STEP 2: Fetch EUR/USD rate for HBD conversion
  const rateData = await getEurUsdRateServerSide();
  result.eurUsdRate = rateData.conversion_rate;
  const hbdAmountForOrder = convertEurToHbd(orderAmount, result.eurUsdRate);

  console.log(`[PAYMENT] Step 2: EUR/USD rate: ${result.eurUsdRate}, HBD amount: ${hbdAmountForOrder}`);

  // STEP 3a: Transfer HBD/EURO from innopay to restaurant (MUST SUCCEED)
  console.log(`[PAYMENT] Step 3a: Transfer payment to restaurant (EUR: ${orderAmount}, HBD: ${hbdAmountForOrder})`);
  try {
    console.log(`[PAYMENT] Attempting HBD transfer to ${restaurantAccount} with memo:`, orderMemo);
    result.restaurantHbdTxId = await transferHbd(restaurantAccount, hbdAmountForOrder, orderMemo);
    console.log(`[PAYMENT] ✅ HBD transferred to restaurant: ${result.restaurantHbdTxId}`);
  } catch (hbdError: any) {
    // Fallback to EURO tokens if HBD insufficient
    console.warn(`[PAYMENT] ⚠️ HBD transfer to restaurant failed, using EURO token fallback:`, hbdError.message);

    // Record debt - innopay owes HBD to restaurant (non-blocking)
    try {
      await prisma.outstanding_debt.create({
        data: {
          creditor: getRecipientForEnvironment(restaurantAccount),
          debtor: 'innopay',
          amount_hbd: hbdAmountForOrder,
          eur_usd_rate: result.eurUsdRate,
          reason,
          notes: `HBD shortage at ${new Date().toISOString()} - ${reason}`
        }
      });
      console.log(`📝 [DEBT] Recorded ${hbdAmountForOrder} HBD debt from innopay to restaurant`);
    } catch (debtError) {
      console.error('[PAYMENT] WARNING: Failed to record debt:', debtError);
    }

    console.log(`[PAYMENT] Attempting EURO token transfer to restaurant with memo:`, orderMemo);
    result.restaurantEuroTxId = await transferEuroTokens(restaurantAccount, orderAmount, orderMemo);
    console.log(`[PAYMENT] ✅ EURO tokens transferred to restaurant: ${result.restaurantEuroTxId}`);
  }

  // STEP 3b: Transfer HBD from customer to innopay (using innopay's active authority)
  // This attempts to get HBD from customer for the HBD we'll owe or just paid to restaurant
  if (fromCustomer) {
    console.log(`[PAYMENT] Step 3b: Attempting HBD transfer from ${customerAccount} to innopay`);
    try {
      result.customerHbdTxId = await transferHbdFromAccount(
        customerAccount,
        'innopay',
        hbdAmountForOrder,
        'HBD payment to innopay'
      );
      console.log(`[PAYMENT] ✅ Customer HBD transferred to innopay: ${result.customerHbdTxId}`);
    } catch (customerHbdError: any) {
      console.warn(`[PAYMENT] ⚠️ Customer HBD transfer failed (likely insufficient HBD):`, customerHbdError.message);

      // Record HBD debt - customer owes innopay HBD (non-blocking)
      try {
        await prisma.outstanding_debt.create({
          data: {
            creditor: 'innopay',
            debtor: customerAccount,
            amount_hbd: hbdAmountForOrder,
            euro_tx_id: result.customerEuroTxId || null,
            eur_usd_rate: result.eurUsdRate,
            reason,
            notes: `HBD transfer failed at ${new Date().toISOString()}: ${customerHbdError.message}`
          }
        });
        console.log(`📝 [DEBT] Recorded ${hbdAmountForOrder} HBD debt from ${customerAccount} to innopay`);
      } catch (debtError) {
        console.error('[PAYMENT] WARNING: Failed to record HBD debt:', debtError);
      }
    }
  }

  console.log(`[PAYMENT] ✅ Order payment complete`);
  return result;
}

/**
 * Transfers topup amount to customer account (both EURO and HBD if available)
 * Used for pure topups and change returns
 *
 * @param params Topup parameters
 * @returns Transaction IDs
 */
export async function transferTopupToCustomer(params: {
  customerAccount: string;
  amount: number;
  memo: string;
  reason?: string;
}): Promise<{ euroTxId: string; hbdTxId?: string; eurUsdRate: number }> {
  const { customerAccount, amount, memo, reason = 'topup' } = params;

  console.log(`[TOPUP] Transferring ${amount}€ to ${customerAccount}`);

  // Transfer EURO tokens
  const euroTxId = await transferEuroTokens(customerAccount, amount, memo);
  console.log(`[TOPUP] ✅ EURO transferred: ${euroTxId}`);

  // Get rate for HBD conversion
  const rateData = await getEurUsdRateServerSide();
  const eurUsdRate = rateData.conversion_rate;
  const hbdAmount = convertEurToHbd(amount, eurUsdRate);

  let hbdTxId: string | undefined;

  // Try to transfer HBD
  try {
    hbdTxId = await transferHbd(customerAccount, hbdAmount, memo);
    console.log(`[TOPUP] ✅ HBD transferred: ${hbdTxId}`);
  } catch (hbdError: any) {
    console.warn(`[TOPUP] ⚠️ HBD transfer failed, recording debt:`, hbdError.message);

    // Record debt - innopay owes HBD to customer
    try {
      await prisma.outstanding_debt.create({
        data: {
          creditor: customerAccount,
          amount_hbd: hbdAmount,
          euro_tx_id: euroTxId,
          eur_usd_rate: eurUsdRate,
          reason,
          notes: `HBD shortage at ${new Date().toISOString()}`
        }
      });
      console.log(`📝 [DEBT] Recorded ${hbdAmount} HBD debt to customer`);
    } catch (debtError) {
      console.error('[TOPUP] WARNING: Failed to record debt:', debtError);
    }
  }

  return { euroTxId, hbdTxId, eurUsdRate };
}
