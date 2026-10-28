/** Mark the live Zenbar spoke ready. No images, payment or return fields change. */
const fs = require('node:fs');
const path = require('node:path');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error: console.error });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.spoke.findMany({
      where: { id: { in: ['innohatch', 'zenbar'] } },
      select: { id: true, ready: true, image_1: true, domain_prod: true, path: true },
    });
    if (before.length !== 2) throw new Error('Expected both Farm and Zenbar to exist; no records were changed.');
    const updates = [{ id: 'zenbar', data: { ready: true } }];
    const pending = updates.filter(update => {
      const row = before.find(item => item.id === update.id);
      return Object.entries(update.data).some(([key, value]) => row[key] !== value);
    });
    console.log(JSON.stringify({ before, requested: pending }, null, 2));
    if (!process.argv.includes('--apply') || pending.length === 0) return;
    const backupIndex = process.argv.indexOf('--backup');
    if (backupIndex < 0 || !process.argv[backupIndex + 1]) throw new Error('--apply requires an explicit --backup path.');
    fs.writeFileSync(process.argv[backupIndex + 1], JSON.stringify(before, null, 2), { flag: 'wx' });
    await prisma.$transaction(pending.map(update => prisma.spoke.update({ where: { id: update.id }, data: update.data })));
    console.log('Marked Zenbar ready. Farm readiness, photos and all checkout routing fields are unchanged.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
