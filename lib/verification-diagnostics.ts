import { createHash } from 'node:crypto';

// Keep the diagnostic query deliberately free of OTPs and wallet credentials.
export const verificationDiagnosticSelect = {
  id: true, created_at: true, expires_at: true,
  verified: true, verified_at: true, attempts: true,
} as const;

type VerificationRecord = {
  id: string;
  created_at: Date;
  expires_at: Date;
  verified: boolean;
  verified_at: Date | null;
  attempts: number;
};

export function verificationSnapshot(record: VerificationRecord | null, now = new Date()) {
  if (!record) return { reason: 'missing' as const };
  const reason = record.verified ? 'already_used'
    : record.attempts >= 3 ? 'attempt_limit'
    : record.expires_at <= now ? 'expired' : 'pending';
  return {
    reason,
    verificationId: record.id,
    createdAt: record.created_at.toISOString(),
    expiresAt: record.expires_at.toISOString(),
    verifiedAt: record.verified_at?.toISOString() ?? null,
    attempts: record.attempts,
    ageSeconds: Math.floor((now.getTime() - record.created_at.getTime()) / 1000),
    expiresInSeconds: Math.floor((record.expires_at.getTime() - now.getTime()) / 1000),
  };
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function verificationContext(
  email: string,
  requestUrl: string,
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
) {
  let databaseTag = 'unconfigured';
  if (env.POSTGRES_URL) {
    try {
      const db = new URL(env.POSTGRES_URL);
      // Identify the database without revealing its host, username or password.
      databaseTag = fingerprint(`${db.hostname}:${db.port || '5432'}${db.pathname}?schema=${db.searchParams.get('schema') || 'public'}`);
    } catch { databaseTag = 'invalid-url'; }
  }
  return {
    emailTag: fingerprint(email.trim().toLowerCase()),
    hubHost: new URL(requestUrl).host,
    origin: origin?.slice(0, 200) ?? null,
    environment: env.VERCEL_ENV || env.NODE_ENV || 'unknown',
    deployment: env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'local',
    databaseTag,
  };
}

type DiagnosticDetails = Partial<ReturnType<typeof verificationSnapshot>> & {
  accountsCount?: number;
  single?: boolean;
};

export function createVerificationLogger(email: string, request: { url: string; headers: Headers }) {
  const context = verificationContext(email, request.url, request.headers.get('origin'));
  return (event: string, details: DiagnosticDetails = {}) => {
    // warn is intentional: operational logs are visible on this Vercel plan.
    console.warn('[VERIFY TRACE]', JSON.stringify({ event, at: new Date().toISOString(), ...context, ...details }));
  };
}
