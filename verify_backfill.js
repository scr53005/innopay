const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyBackfill() {
  const walletUsers = await prisma.walletuser.findMany({
    select: {
      id: true,
      accountName: true,
      userId: true,
      innouser: {
        select: {
          email: true
        }
      }
    },
    orderBy: { creationDate: 'desc' },
    take: 10
  });

  console.log('\n=== Recent Walletuser Records ===');
  walletUsers.forEach(wu => {
    console.log(`${wu.accountName}: userId=${wu.userId || 'NULL'}, email=${wu.innouser?.email || 'none'}`);
  });

  const withUserId = await prisma.walletuser.count({ where: { userId: { not: null } } });
  const withoutUserId = await prisma.walletuser.count({ where: { userId: null } });

  console.log(`\n=== Summary ===`);
  console.log(`Walletusers with userId: ${withUserId}`);
  console.log(`Walletusers without userId: ${withoutUserId}`);

  await prisma.$disconnect();
}

verifyBackfill().catch(console.error);
