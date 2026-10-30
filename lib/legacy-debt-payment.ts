export function validateLegacyPayments(payments: Array<{ debt_id: string; amount_hbd: number; tx_id: string }>): void {
  if (!payments.length || new Set(payments.map((p) => p.debt_id)).size !== payments.length) {
    throw new Error('A non-empty set of distinct debts is required');
  }
  for (const payment of payments) {
    if (!payment.debt_id || !Number.isFinite(payment.amount_hbd) || payment.amount_hbd <= 0
      || Math.abs(payment.amount_hbd * 1000 - Math.round(payment.amount_hbd * 1000)) > 1e-7
      || !/^[a-f0-9]{40}$/.test(payment.tx_id ?? '')) {
      throw new Error('A positive milli-HBD payment and actual Hive transaction ID are required');
    }
  }
}
