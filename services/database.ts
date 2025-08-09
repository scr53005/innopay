import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { formatAccountName } from './utils';

const prisma = new PrismaClient();


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