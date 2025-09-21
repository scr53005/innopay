import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { formatAccountName } from './utils';

const prisma = new PrismaClient();

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

export async function createWalletUser(accountName: string, hivetxid: string) {
  // 1. Chercher le compte existant
  const existingUser = await prisma.walletuser.findUnique({
    where: {
      accountName: accountName,
    },
  });

  // Si le compte n'existe pas, le créer normalement
  if (!existingUser) {
    console.log('new innopay wallet user, creating:', accountName, hivetxid);
    return prisma.walletuser.create({
      data: {
        accountName: accountName,
        hivetxid: hivetxid,
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