import prisma from './prisma';

export type AuthoritySigningMode = 'explicit' | 'fallback';

export type AuthoritySigningEntry = {
  signer: string;
  mode: AuthoritySigningMode;
  symbol: string;
  quantity: string;
  toAccount: string;
  txId: string;
};

/**
 * Record one payment signed with @innopay's key on a customer's behalf. Liman reads these rows
 * (GET /api/internal/authority-signings) to show when the no-key fallback can be retired.
 * Runs after the response (after()), and never throws: the payment is already on chain, and a
 * missed statistic must not turn it into an error for the customer.
 */
export async function recordAuthoritySigning(entry: AuthoritySigningEntry): Promise<void> {
  try {
    await prisma.innopay_authority_signing.create({
      data: {
        signer: entry.signer,
        mode: entry.mode,
        symbol: entry.symbol,
        quantity: entry.quantity,
        to_account: entry.toAccount,
        tx_id: entry.txId,
      },
    });
  } catch (error) {
    console.warn('[SIGN-API] Could not record innopay-authority signing for', entry.signer, entry.txId, error);
  }
}
