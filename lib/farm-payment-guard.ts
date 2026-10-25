import prisma from '@/lib/prisma';

export class ArchivedFarmVendorError extends Error {}

/** Reject a Farm order payout after its vendor is archived.
 * Non-Farm transfers, including ordinary wallet top-ups, are unaffected.
 */
export async function assertFarmOrderRecipientActive(recipient: string, memo: string | undefined): Promise<void> {
  if (!memo || !memo.includes('-inno-') || !/\bQ:[A-Z]+-\d{2}\b/.test(memo)) return;
  const environment = process.env.HATCH_TARGET_ENV === 'dev' ? 'dev' : 'prod';
  const registration = await prisma.spoke_account.findUnique({
    where: {
      spoke_id_hive_account_environment_role: {
        spoke_id: 'innohatch', hive_account: recipient, environment, role: 'orders_and_tips',
      },
    },
    select: { active: true },
  });
  if (registration && !registration.active) {
    throw new ArchivedFarmVendorError(`Farm vendor @${recipient} is archived; order payment is disabled`);
  }
}
