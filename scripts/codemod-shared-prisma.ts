// Switches hub files that built their own PrismaClient (and $disconnect-ed it after each request,
// opening a new database connection per call) to the shared client in lib/prisma.ts (2026-11-07).
// Idempotent: a file without `new PrismaClient()` is reported and skipped.
// Run: npx tsx scripts/codemod-shared-prisma.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
// [file, import path for the shared client]. services/ uses a relative path (tsx/vitest, CLAUDE.md).
const FILES: [string, string][] = [
  ['app/api/campaigns/active/route.ts', '@/lib/prisma'],
  ['app/api/checkout/account/route.ts', '@/lib/prisma'],
  ['app/api/spokes/[id]/route.ts', '@/lib/prisma'],
  ['services/database.ts', '../lib/prisma'],
];
const DISCONNECT = /\n  \} finally \{\n    await prisma\.\$disconnect\(\);\n  \}\n/;

for (const [rel, from] of FILES) {
  const path = join(ROOT, rel);
  const raw = readFileSync(path, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  if (!text.includes('new PrismaClient()')) { console.log(`skip (already shared): ${rel}`); continue; }
  text = text.replace("import { PrismaClient } from '@prisma/client';\n", '');
  text = text.replace(/\nconst prisma = new PrismaClient\(\);\n/, '\n');
  // services/database.ts loads dotenv first: keep the shared client's import after it.
  if (text.includes("import 'dotenv/config';\n")) {
    text = text.replace("import 'dotenv/config';\n", `import 'dotenv/config';\nimport prisma from '${from}';\n`);
  } else {
    const firstImportEnd = text.indexOf('\n', text.indexOf('import ')) + 1;
    text = text.slice(0, firstImportEnd) + `import prisma from '${from}';\n` + text.slice(firstImportEnd);
  }
  const hadDisconnect = DISCONNECT.test(text);
  text = text.replace(DISCONNECT, '\n  }\n');
  if (text.includes('PrismaClient')) throw new Error(`PrismaClient still referenced in ${rel}`);
  writeFileSync(path, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log(`shared client: ${rel}${hadDisconnect ? ' (per-request $disconnect removed)' : ''}`);
}
