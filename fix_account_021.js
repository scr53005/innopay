const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAccount021() {
  console.log('Updating test000-000-021 to have userId=4 (scr53005@gmail.com)');

  const updated = await prisma.walletuser.update({
    where: { accountName: 'test000-000-021' },
    data: { userId: 4 }
  });

  console.log('Updated:', updated.accountName, '→ userId=', updated.userId);

  // Verify the user now has 2 accounts
  const user4Accounts = await prisma.walletuser.findMany({
    where: { userId: 4 },
    select: { accountName: true, creationDate: true }
  });

  console.log('\nAll accounts for userId=4 (scr53005@gmail.com):');
  user4Accounts.forEach(a => {
    console.log(`  - ${a.accountName} (${a.creationDate.toISOString()})`);
  });

  await prisma.$disconnect();
}

fixAccount021().catch(console.error);
