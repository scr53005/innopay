/**
 * One-time catch-up script: Send credential delivery emails to existing walletusers
 * that haven't received one yet.
 *
 * Usage:
 *   npx tsx scripts/send-credential-emails.ts              # dry run (list accounts)
 *   npx tsx scripts/send-credential-emails.ts --send        # actually send emails
 *   npx tsx scripts/send-credential-emails.ts --account xyz  # single account only
 */

import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

// We can't use @/ path aliases in standalone scripts, so import relatively
// For generateHiveKeys and email template, we duplicate minimally here

const prisma = new PrismaClient();

// Re-import these from the project (relative paths from scripts/)
// Using dynamic imports to handle the path resolution
async function main() {
  const args = process.argv.slice(2);
  const shouldSend = args.includes('--send');
  const accountIndex = args.indexOf('--account');
  const singleAccount = accountIndex !== -1 ? args[accountIndex + 1] : null;

  console.log(`\n=== Credential Email Catch-Up Script ===`);
  console.log(`Mode: ${shouldSend ? 'SEND' : 'DRY RUN (add --send to actually send)'}`);
  if (singleAccount) console.log(`Single account: ${singleAccount}`);
  console.log('');

  try {
    // Find all walletusers with userId + seed + masterPassword (linked to an innouser with email)
    const walletusers = await prisma.walletuser.findMany({
      where: {
        userId: { not: null },
        seed: { not: null },
        masterPassword: { not: null },
        ...(singleAccount ? { accountName: singleAccount } : {}),
      },
      include: {
        innouser: true,
      },
    });

    console.log(`Found ${walletusers.length} walletuser(s) with linked innouser + credentials`);

    // Find which ones already have a cred_email_ session
    const existingSessions = await prisma.accountCredentialSession.findMany({
      where: {
        stripeSessionId: { startsWith: 'cred_email_' },
      },
      select: {
        stripeSessionId: true,
      },
    });

    // Extract walletuser IDs from existing cred_email_ session IDs
    const sentWalletUserIds = new Set(
      existingSessions
        .map(s => {
          const match = s.stripeSessionId.match(/^cred_email_(\d+)_/);
          return match ? parseInt(match[1]) : null;
        })
        .filter((id): id is number => id !== null)
    );

    // Filter to only unsent
    const pending = walletusers.filter(wu => !sentWalletUserIds.has(wu.id));

    console.log(`Already sent: ${walletusers.length - pending.length}`);
    console.log(`Pending: ${pending.length}\n`);

    if (pending.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const wu of pending) {
      const email = wu.innouser?.email;
      if (!email) {
        console.log(`  SKIP ${wu.accountName} — no email`);
        skipped++;
        continue;
      }

      console.log(`  ${shouldSend ? 'SENDING' : 'WOULD SEND'} → ${wu.accountName} (${email})`);

      if (shouldSend) {
        try {
          // Dynamic import of the service (uses @/ aliases, needs Next.js context)
          // Instead, we inline the logic here for the standalone script
          const { generateHiveKeys } = await import('../services/hive');
          const { buildCredentialDeliveryEmail } = await import('../lib/email-templates');

          const keychain = generateHiveKeys(wu.accountName, wu.seed!);

          const credentialSession = await prisma.accountCredentialSession.create({
            data: {
              accountName: wu.accountName,
              stripeSessionId: `cred_email_${wu.id}_${Date.now()}`,
              masterPassword: keychain.masterPassword,
              ownerPrivate: keychain.owner.privateKey,
              ownerPublic: keychain.owner.publicKey,
              activePrivate: keychain.active.privateKey,
              activePublic: keychain.active.publicKey,
              postingPrivate: keychain.posting.privateKey,
              postingPublic: keychain.posting.publicKey,
              memoPrivate: keychain.memo.privateKey,
              memoPublic: keychain.memo.publicKey,
              euroBalance: 0,
              email,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://wallet.innopay.lu';
          const credentialUrl = `${baseUrl}/credentials/${credentialSession.id}`;
          const { subject, html, text } = buildCredentialDeliveryEmail(wu.accountName, credentialUrl);

          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu',
            to: email,
            subject,
            html,
            text,
          });

          console.log(`    OK — session ${credentialSession.id}`);
          sent++;

          // Small delay between sends (Resend rate limits)
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
          console.error(`    ERROR — ${err.message || err}`);
          errors++;
        }
      } else {
        sent++; // Count as "would send" in dry run
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`${shouldSend ? 'Sent' : 'Would send'}: ${sent}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
