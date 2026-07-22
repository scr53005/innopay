// Hive account-name FORMAT validation — lifted verbatim (rules) from the
// customer account-creation flow in app/user/page.tsx (`validateAndHandleInput`)
// so the hatch page enforces the exact same constraints. Pure + exported for
// testing; availability (is the name already taken on chain) is a separate,
// async HAF check the caller layers on top.

export interface AccountNameValidation {
  valid: boolean;
  message: string; // '' when valid
}

export function validateHiveAccountName(input: string): AccountNameValidation {
  const name = input.toLowerCase();

  if (name.length < 3) {
    return { valid: false, message: 'Hive usernames must be at least 3 characters long.' };
  }
  if (name.length > 16) {
    return { valid: false, message: `Hive usernames must not exceed 16 characters (you entered: ${name.length}).` };
  }
  if (!/^[a-z0-9.-]+$/.test(name)) {
    return { valid: false, message: 'Only lowercase letters (a-z), numbers (0-9), dots (.), and hyphens (-) are allowed.' };
  }

  // Dot-separated labels, each independently constrained.
  const labels = name.split('.');
  if (labels.some((l) => l.length === 0)) {
    return { valid: false, message: 'No consecutive dots or leading/trailing dots allowed.' };
  }
  if (labels.some((l) => l.length < 3)) {
    return { valid: false, message: 'Each segment (between dots) must be at least 3 characters.' };
  }
  if (labels.some((l) => !/^[a-z]/.test(l))) {
    return { valid: false, message: 'Each segment must start with a lowercase letter.' };
  }
  if (labels.some((l) => !/[a-z0-9]$/.test(l))) {
    return { valid: false, message: 'Each segment must end with a lowercase letter or number.' };
  }
  if (labels.some((l) => /^-|-{2,}|-$/.test(l))) {
    return { valid: false, message: 'Hyphens cannot be at the start/end of a segment or consecutive.' };
  }

  return { valid: true, message: '' };
}
