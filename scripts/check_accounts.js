const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAccounts() {
  // Check what's in bip39seedandaccount
  console.log('\n=== bip39seedandaccount (one-to-one with innouser) ===');
  const seeds = await prisma.bip39seedandaccount.findMany({
    include: {
      innouser: {
        select: { id: true, email: true }
      }
    },
    orderBy: { id: 'desc' }
  });

  seeds.forEach(s => {
    console.log(`userId=${s.userId}, account=${s.accountName}, email=${s.innouser.email}`);
  });

  // Check walletuser records
  console.log('\n=== walletuser (should be one-to-many with innouser) ===');
  const wallets = await prisma.walletuser.findMany({
    select: {
      id: true,
      accountName: true,
      userId: true,
      creationDate: true
    },
    orderBy: { creationDate: 'desc' },
    take: 5
  });

  wallets.forEach(w => {
    console.log(`${w.accountName}: userId=${w.userId || 'NULL'}, created=${w.creationDate.toISOString()}`);
  });

  // Check if test000-000-021 should have userId=4
  const account21 = await prisma.walletuser.findUnique({
    where: { accountName: 'test000-000-021' }
  });

  console.log('\n=== Checking test000-000-021 ===');
  console.log(JSON.stringify(account21, null, 2));

  await prisma.$disconnect();
}

checkAccounts().catch(console.error);
