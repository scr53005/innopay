// services/credential-email.ts
// Service for sending one-time credential delivery emails after account creation.
// Reuses accountCredentialSession with a synthetic stripeSessionId (cred_email_ prefix).

import { Resend } from 'resend';
import prisma from '@/lib/prisma';
import { buildCredentialDeliveryEmail } from '@/lib/email-templates';
import { generateHiveKeys } from '@/services/hive';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a one-time credential delivery email for a walletuser.
 * Creates an accountCredentialSession record (7-day expiry) and sends
 * an email with a one-time link to view credentials.
 *
 * @param walletUserId - The walletuser record ID
 * @returns The credential session ID (used as token in URL), or null on failure
 */
export async function sendCredentialEmail(walletUserId: number): Promise<string | null> {
  // 1. Fetch walletuser with linked innouser
  const walletUser = await prisma.walletuser.findUnique({
    where: { id: walletUserId },
    include: { innouser: true },
  });

  if (!walletUser) {
    console.error(`[CRED EMAIL] walletuser not found: id=${walletUserId}`);
    return null;
  }

  if (!walletUser.innouser) {
    console.error(`[CRED EMAIL] walletuser ${walletUser.accountName} has no linked innouser`);
    return null;
  }

  if (!walletUser.seed || !walletUser.masterPassword) {
    console.error(`[CRED EMAIL] walletuser ${walletUser.accountName} missing seed or masterPassword`);
    return null;
  }

  const email = walletUser.innouser.email;
  const accountName = walletUser.accountName;

  // 2. Derive keys from seed (walletuser only stores seed + masterPassword, not derived keys)
  const keychain = generateHiveKeys(accountName, walletUser.seed);

  // 3. Create accountCredentialSession with synthetic stripeSessionId and 7-day expiry
  const credentialSession = await prisma.accountCredentialSession.create({
    data: {
      accountName,
      stripeSessionId: `cred_email_${walletUserId}_${Date.now()}`,
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
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // 4. Build credential URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://wallet.innopay.lu';
  const credentialUrl = `${baseUrl}/credentials/${credentialSession.id}`;

  // 5. Build and send email
  const { subject, html, text } = buildCredentialDeliveryEmail(accountName, credentialUrl);

  try {
    const emailResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@verify.innopay.lu',
      to: email,
      subject,
      html,
      text,
    });

    console.log(`[CRED EMAIL] Sent credential email to ${email} for account ${accountName}:`, emailResult);
    return credentialSession.id;
  } catch (err: any) {
    // Keep the session record on failure for auditability (will expire in 7 days if unused).
    // Undelivered emails can be found by querying for cred_email_ sessions that are not retrieved.
    console.error(`[CRED EMAIL] Failed to send email to ${email} for account ${accountName} (walletUserId=${walletUserId}):`, err.message || err);
    return null;
  }
}
