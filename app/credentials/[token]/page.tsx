import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import CredentialDisplay from './CredentialDisplay';
import ExpiredOrUsedMessage from './ExpiredOrUsedMessage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function CredentialPage({ params }: PageProps) {
  const { token } = await params;

  // 1. Find the credential session by ID (the cuid serves as the token)
  const session = await prisma.accountCredentialSession.findUnique({
    where: { id: token },
  });

  if (!session) {
    return notFound();
  }

  // 2. Check if already used
  if (session.retrieved) {
    return <ExpiredOrUsedMessage reason="already_used" />;
  }

  // 3. Check if expired
  if (new Date() > session.expiresAt) {
    return <ExpiredOrUsedMessage reason="expired" />;
  }

  // 4. Atomically mark as retrieved (prevents race conditions with concurrent clicks)
  const result = await prisma.accountCredentialSession.updateMany({
    where: { id: token, retrieved: false },
    data: { retrieved: true },
  });

  if (result.count === 0) {
    // Another request beat us — already marked as retrieved
    return <ExpiredOrUsedMessage reason="already_used" />;
  }

  // 5. Look up walletuser for seed and creationDate (not stored in credential session)
  const walletUser = await prisma.walletuser.findUnique({
    where: { accountName: session.accountName },
  });

  // 6. Mark innouser as verified (idempotent — unique email, setting true to true is a no-op)
  if (session.email) {
    await prisma.innouser.updateMany({
      where: { email: session.email },
      data: { verified: true },
    });
  }

  // 7. Build credentials for display
  const credentials = {
    // Displayed to user
    accountName: session.accountName,
    creationDate: walletUser?.creationDate?.toISOString() || new Date().toISOString(),
    seed: walletUser?.seed || '',
    masterPassword: session.masterPassword,
    // Hidden — for localStorage write on redirect
    ownerPrivate: session.ownerPrivate,
    ownerPublic: session.ownerPublic,
    activePrivate: session.activePrivate,
    activePublic: session.activePublic,
    postingPrivate: session.postingPrivate,
    postingPublic: session.postingPublic,
    memoPrivate: session.memoPrivate,
    memoPublic: session.memoPublic,
    email: session.email || '',
  };

  return <CredentialDisplay credentials={credentials} />;
}
