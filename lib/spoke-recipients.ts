import prisma from './prisma';

// Payment routes pay "the restaurant" named in the request body. Security fix 2026-11-02:
// that name must be a registered, ACTIVE spoke/vendor account — otherwise a caller could make
// innopay send HBD to any account, e.g. their own.
export async function isActiveSpokeAccount(account: string): Promise<boolean> {
  return (await activeSpokeIdForAccount(account)) !== null;
}

/** The spoke an active account belongs to ('innohatch' for Farm vendors), or null. */
export async function activeSpokeIdForAccount(account: string): Promise<string | null> {
  if (!account) return null;
  const row = await prisma.spoke_account.findFirst({
    where: { hive_account: account, active: true },
    select: { spoke_id: true },
  });
  return row?.spoke_id ?? null;
}
