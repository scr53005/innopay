// Removes the hub landing page's Flow 7 import (app/page.tsx) on 2026-11-08 (indies R4d): it took
// `?topup_for=order&source=indiesmenu&account=X` and fetched X's keys with getAccountCredentials,
// with no proof of ownership. Indies now uses /wallet-handoff; every other spoke uses /user.
// Cuts from a unique start anchor to the end of a unique end anchor. Idempotent.
// Run: npx tsx scripts/codemod-remove-landing-flow7.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PAGE = join(__dirname, '..', 'app', 'page.tsx');
const BLOCKS = [
  {
    name: 'Flow 7 landing effect (account override + by-name key import)',
    start: '  // FLOW 7: Handle incoming context from indiesmenu (pay_with_topup)\n',
    end: '      // STEP 6: Trigger account detection (will happen in main useEffect)\n      setHasAccount(true);\n    }\n  }, [searchParams]);\n\n',
  },
  {
    name: 'Flow 7 order card',
    start: '        {/* Order Context Banner - Show when topping up for restaurant order (Flow 7) */}\n',
    end: '          </div>\n        )}\n\n        {/* Discovery stays accessible',
    keepEnd: '        {/* Discovery stays accessible',
  },
];

const raw = readFileSync(PAGE, 'utf8');
const crlf = raw.includes('\r\n');
let page = raw.replace(/\r\n/g, '\n');
for (const b of BLOCKS) {
  const start = page.indexOf(b.start);
  if (start < 0) { console.log(`skip (already removed): ${b.name}`); continue; }
  if (page.indexOf(b.start, start + 1) >= 0) throw new Error(`start anchor not unique: ${b.name}`);
  const endAt = page.indexOf(b.end, start);
  if (endAt < 0) throw new Error(`end anchor not found: ${b.name}`);
  const end = endAt + b.end.length;
  const removed = page.slice(start, end).split('\n').length - 1;
  page = page.slice(0, start) + (b.keepEnd ?? '') + page.slice(end);
  console.log(`removed ${removed} lines: ${b.name}`);
}
writeFileSync(PAGE, crlf ? page.replace(/\n/g, '\r\n') : page);
