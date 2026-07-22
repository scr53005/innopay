import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { formatAccountName } from './utils';

const prisma = new PrismaClient();

// Define the DbMetadata type to match the structure used in the database
export type DbMetadata = {
  name: string;
  about: string;
  location: string;
  website: string;
  avatarUri: string;
  backgroundUri: string;
};

export const setWalletUserMetadata = async (accountName: string, metadata: DbMetadata) => {
  return prisma.walletuser.update({
    where: { accountName },
    data: {
      profileName: metadata.name,
      profileAvatar: metadata.avatarUri,
      profileBckgrd: metadata.backgroundUri,
      profileAbout: metadata.about,
      profileLoc: metadata.location,
      profileWeb: metadata.website,
    },
  });
}

// This function now specifically queries the walletuser table for metadata
export const getWalletUserMetadata = async (accountName: string) => {
  try {
    const user = await prisma.walletuser.findUnique({
      where: { accountName },
      select: {
        profileName: true,
        profileAvatar: true,
        profileBckgrd: true,
        profileAbout: true,
        profileLoc: true,
        profileWeb: true,
      },
    });

    if (!user) {
      return null;
    }

    // Map the database fields to the expected Metadata type
    const metadata = {
      name: user.profileName || '',
      about: user.profileAbout || '',
      location: user.profileLoc || '',
      website: user.profileWeb || '',
      avatarUri: user.profileAvatar || '',
      backgroundUri: user.profileBckgrd || '',
    };

    return metadata;
  } catch (error) {
    console.error('Database query failed:', error);
    return null;
  }
};

// This is a helper function to determine the next sequential Hive account name.
// It receives the last created account record and returns the next formatted name.
export function nextAccountName(lastAccount: { accountName: string } | null): string {
  // Extract the number, increment, and format
  const lastNumber = lastAccount ? parseInt(lastAccount.accountName.slice(4).replace(/-/g, '')) : 0;
  const nextNumber = lastNumber + 1;
  console.log(`Next account number to be created: ${nextNumber} - ` + formatAccountName(nextNumber));
  return formatAccountName(nextNumber);
}

// Finds a user by email, including their associated seed and account data.
export async function findInnoUserByEmail(email: string) {
  return prisma.innouser.findUnique({
    where: { email: email },
    include: { bip39seedandaccount: true }
  });
}

export async function createWalletUser(
  accountName: string,
  hivetxid: string,
  seed?: string,
  masterPassword?: string,
  userId?: number | null
) {
  // 1. Chercher le compte existant
  const existingUser = await prisma.walletuser.findUnique({
    where: {
      accountName: accountName,
    },
  });

  // Si le compte n'existe pas, le créer normalement
  if (!existingUser) {
    console.log('new innopay wallet user, creating:', accountName, hivetxid, 'userId:', userId || 'none');
    return prisma.walletuser.create({
      data: {
        accountName: accountName,
        hivetxid: hivetxid,
        seed: seed || null,
        masterPassword: masterPassword || null,
        userId: userId || null,
      },
    });
  }

  // Si le compte existe, gérer les cas de 'mock'
  if (existingUser.hivetxid.startsWith('mock_')) {
    // Cas 2.2: L'enregistrement existant est un 'mock'
    if (hivetxid.startsWith('mock_')) {
      // Les deux sont des 'mock', rien à faire
      console.log('Both existing and new Hive tx ids are mock, no update needed.');
      return;
    } else {
      // Le nouvel identifiant est réel, mettre à jour l'enregistrement
      console.log('Updating existing mock record with real Hive tx id.');
      await prisma.walletuser.update({
        where: {
          accountName: accountName,
        },
        data: {
          hivetxid: hivetxid,
          seed: seed || existingUser.seed,
          masterPassword: masterPassword || existingUser.masterPassword,
        },
      });
      return;
    }
  } else {
    // Cas 2.1: L'enregistrement existant n'est pas un 'mock'
    // C'est une situation inattendue, lever une erreur
    console.error('Hive tx id existant non-mock:', existingUser.hivetxid);
    throw new Error('Existing account verification on the blockchain seems to have failed, this situation should not have arisen.');
  }
}

// Creates a new user, a top-up record, and a BIP39 seed/Hive account record in a single transaction.
export async function createNewInnoUserWithTopupAndAccount(
  email: string,
  amountEuro: number,
  seed: string,
  accountName: string,
  hiveTxId?: string
) {
  return prisma.$transaction([
    prisma.innouser.create({
      data: {
        email: email,
        topup: {
          create: {
            amountEuro: amountEuro,
          },
        },
        bip39seedandaccount: {
          create: {
            seed: seed,
            accountName: accountName,
            hivetxid: hiveTxId || null, // Initialize with null before the Hive transaction is successful
          },
        },
      },
      include: {
        bip39seedandaccount: true,
      }
    })
  ]);
}

// Creates a new top-up record for an existing user.
export async function createTopupForExistingUser(userId: number, amountEuro: number) {
  return prisma.topup.create({
    data: {
      userId: userId,
      amountEuro: amountEuro,
    },
  });
}

/**
 * Book a top-up to the TRUE OWNER of a Hive wallet — used by BOTH Flow 2 (pure
 * top-up) and Flow 7 (top-up + order) so they stay consistent.
 *
 * - Wallet already linked (`userId` set) → book to that `userId`, IGNORING the
 *   Stripe-typed email. The wallet's own owner is authoritative; one innouser can
 *   own several wallets, and the EURO is credited on-chain by accountName anyway.
 * - Wallet NOT linked (legacy early users with no innouser) → RETROFIT: find-or-
 *   CREATE the innouser from the email the customer supplied at Stripe, link this
 *   walletuser to it (which enables Flow 8 credential retrieval later), then book.
 *
 * find-or-create is conflict-tolerant: `innouser.email` is `@unique` but has drifted
 * dupes in prod, so we `findFirst` (never `findUnique`) and swallow a create race.
 *
 * Returns the booked userId, or null when no record could be created (the caller
 * has already transferred the EURO on-chain regardless — only the DB record is
 * skipped). Never throws for the "no record" case; real DB errors propagate.
 */
export async function bookTopupToWalletOwner(
  walletUser: { id: number; userId: number | null },
  customerEmail: string | null | undefined,
  amountEuro: number,
): Promise<number | null> {
  if (walletUser.userId) {
    await createTopupForExistingUser(walletUser.userId, amountEuro);
    return walletUser.userId;
  }
  if (!customerEmail) return null;

  let user = await prisma.innouser.findFirst({ where: { email: customerEmail } });
  if (!user) {
    try {
      user = await prisma.innouser.create({ data: { email: customerEmail } });
    } catch {
      // Unique-race / drifted dupe — re-fetch rather than fail the top-up.
      user = await prisma.innouser.findFirst({ where: { email: customerEmail } });
    }
  }
  if (!user) return null;

  await prisma.walletuser.update({ where: { id: walletUser.id }, data: { userId: user.id } });
  await createTopupForExistingUser(user.id, amountEuro);
  return user.id;
}

// Finds the last created Hive account to determine the next sequential account name.
export async function findLastHiveAccount() {
  return prisma.bip39seedandaccount.findFirst({
    orderBy: { accountName: 'desc' }
  });
}

/**
 * Updates the Hive transaction ID for a given account.
 * This is used to maintain database consistency after a successful blockchain broadcast.
 * The function name has been shortened to `updateTxIdForAccount`.
 * @param {string} accountName - The Hive account name.
 * @param {string} hiveTxId - The transaction ID from the Hive blockchain.
 */
export async function updateTxIdForAccount(accountName: string, hiveTxId: string) {
  return prisma.bip39seedandaccount.update({
    where: { accountName: accountName },
    data: { hivetxid: hiveTxId },
  });
}

// ========================================
// Campaign and Bonus Functions
// ========================================

/**
 * Gets the currently active campaign
 * @returns The active campaign or null if none exists
 */
export async function getActiveCampaign() {
  return prisma.campaign.findFirst({
    where: { active: true },
    orderBy: { startDate: 'desc' },
  });
}

/**
 * Gets the bonus count for a specific campaign, separated by tier
 * @param campaignId - The campaign ID
 * @returns Object with count50 and count100
 */
export async function getBonusCountForCampaign(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return { count50: 0, count100: 0 };
  }

  const bonuses = await prisma.bonus.findMany({
    where: { campaignId },
  });

  const count50 = bonuses.filter(b => parseFloat(b.bonusAmount.toString()) === parseFloat(campaign.bonus50.toString())).length;
  const count100 = bonuses.filter(b => parseFloat(b.bonusAmount.toString()) === parseFloat(campaign.bonus100.toString())).length;

  return { count50, count100 };
}

/**
 * Creates a bonus record for a user
 * @param campaignId - The campaign ID
 * @param userId - The innouser ID (optional, for Stripe-created accounts)
 * @param walletUserId - The walletuser ID (optional, for direct-created accounts)
 * @param accountName - The Hive account name
 * @param bonusAmount - The bonus amount in EUR
 */
export async function createBonus(
  campaignId: number,
  userId: number | null,
  walletUserId: number | null,
  accountName: string,
  bonusAmount: number
) {
  return prisma.bonus.create({
    data: {
      campaignId,
      userId,
      walletUserId,
      accountName,
      bonusAmount,
    },
  });
}

// ========================================
// Guest Checkout Functions
// ========================================

/**
 * Creates a guest checkout record
 * @param stripeSessionId - The Stripe checkout session ID
 * @param amountEuro - The amount in EUR
 * @param amountHbd - The amount in HBD
 * @param recipient - The recipient Hive account (e.g., 'indies.cafe')
 * @param memo - The memo for the transfer
 */
export async function createGuestCheckout(
  stripeSessionId: string,
  amountEuro: number,
  amountHbd: number,
  recipient: string,
  memo: string
) {
  return prisma.guestcheckout.create({
    data: {
      stripeSessionId,
      amountEuro,
      amountHbd,
      recipient,
      memo,
      status: 'pending',
    },
  });
}

/**
 * Updates a guest checkout record with transaction details
 * @param stripeSessionId - The Stripe checkout session ID
 * @param hiveTxId - The Hive transaction ID
 * @param status - The status ('completed', 'failed', etc.)
 */
export async function updateGuestCheckout(
  stripeSessionId: string,
  hiveTxId: string | null,
  status: string
) {
  return prisma.guestcheckout.update({
    where: { stripeSessionId },
    data: {
      hiveTxId,
      status,
      completedAt: status === 'completed' ? new Date() : null,
    },
  });
}

/**
 * Finds a guest checkout by Stripe session ID
 * @param stripeSessionId - The Stripe checkout session ID
 */
export async function findGuestCheckoutBySessionId(stripeSessionId: string) {
  return prisma.guestcheckout.findUnique({
    where: { stripeSessionId },
  });
}

/**
 * Finds a walletuser by account name with seed and masterPassword
 * Used for sending credentials to Indiesmenu after account creation
 * @param accountName - The Hive account name
 */
export async function findWalletUserByAccountName(accountName: string) {
  return prisma.walletuser.findUnique({
    where: { accountName },
    select: {
      id: true,
      accountName: true,
      seed: true,
      masterPassword: true,
      creationDate: true,
      hivetxid: true,
    },
  });
}