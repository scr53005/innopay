export function canUpdateDebtStatus(current: string, target: string, reserved: boolean): boolean {
  if (reserved) return false;
  if (current === target) return true;
  if (current === 'paid' || current === 'settled_out_of_band') return false;
  if (target === 'withdrawal_pending') return ['unpaid', 'recovery_ongoing'].includes(current);
  if (target === 'recovery_ongoing' || target === 'settled_out_of_band') return ['unpaid', 'recovery_ongoing'].includes(current);
  return false;
}
