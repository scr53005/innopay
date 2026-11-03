import prisma from './prisma';
import { transferEuroTokens } from '../services/hive';
import { computeRubisReward, parseTipFromMemo } from './rubis';

// Sends the paying customer their RUBIS for a paid order (RUBIS-PLAN.md §1–2). Called by the
// hub AFTER the restaurant is paid, off the customer's critical path (next/server `after`).
// @innopay is the one and only RUBIS treasury; spokes never decide or send RUBIS.
//
// Idempotency: the rubis_reward row (unique order_key) is written BEFORE the broadcast, so a
// retried Stripe webhook / repeated call finds it and stops. Never throws: a RUBIS failure is
// logged and recorded (status 'failed'), never surfaced to the order.

export interface RewardOrderInput {
  orderKey: string; // 'wallet:<tx>' | 'stripe:<session>' | 'direct:<tx>'
  customerAccount: string | null | undefined; // null/undefined = guest checkout → no RUBIS
  recipient: string; // spoke / vendor account that was paid
  orderTotal: number; // fiat charged, tip included
  memo: string | null | undefined; // order memo (tip segment T:X.XX read from it)
  /** RUBIS the customer used to pay part of this order (future split payments). They earn
   *  nothing: only the fiat-paid part accrues. Default 0. */
  rubisSpent?: number;
}

export type RewardOutcome =
  | { status: 'sent'; amount: number; txId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export async function rewardOrder(input: RewardOrderInput): Promise<RewardOutcome> {
  const { orderKey, customerAccount, recipient, orderTotal, memo, rubisSpent = 0 } = input;
  try {
    if (!customerAccount) return { status: 'skipped', reason: 'guest checkout (no wallet)' };
    if (customerAccount === recipient) return { status: 'skipped', reason: 'vendor paying itself' };

    const account = await prisma.spoke_account.findFirst({
      where: { hive_account: recipient, active: true },
      select: { spoke: { select: { id: true, name: true, rubis_rate: true, rubis_tip_multiplier: true } } },
    });
    const spoke = account?.spoke;
    if (!spoke || spoke.rubis_rate === null) return { status: 'skipped', reason: 'spoke does not distribute RUBIS' };

    const rate = Number(spoke.rubis_rate);
    const tipMultiplier = Number(spoke.rubis_tip_multiplier);
    const tip = parseTipFromMemo(memo);
    const amount = computeRubisReward({ orderTotal, tip, rate, tipMultiplier, rubisSpent });
    if (amount <= 0) return { status: 'skipped', reason: 'reward rounds to 0' };

    try {
      await prisma.rubis_reward.create({
        data: {
          order_key: orderKey, customer_account: customerAccount, spoke_id: spoke.id, recipient,
          order_total: orderTotal, tip, rubis_spent: rubisSpent, rate, tip_multiplier: tipMultiplier, rubis_amount: amount,
        },
      });
    } catch {
      return { status: 'skipped', reason: 'already rewarded' }; // unique order_key
    }

    try {
      // No "-inno-" in this memo: it is not an order (merchant-hub and the Farm guard ignore it).
      const txId = await transferEuroTokens(customerAccount, amount, `RUBIS · merci ! — ${spoke.name}`, 'RUBIS');
      await prisma.rubis_reward.update({ where: { order_key: orderKey }, data: { status: 'sent', rubis_tx_id: txId } });
      console.warn(`[RUBIS] ${amount} RUBIS → @${customerAccount} (${spoke.id}, ${orderKey}) tx ${txId}`);
      return { status: 'sent', amount, txId };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await prisma.rubis_reward.update({ where: { order_key: orderKey }, data: { status: 'failed', error: reason } })
        .catch(() => {});
      console.error(`[RUBIS] transfer failed for ${orderKey} (@${customerAccount}, ${amount}):`, reason);
      return { status: 'failed', reason };
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error('[RUBIS] reward skipped on error:', reason);
    return { status: 'failed', reason };
  }
}
