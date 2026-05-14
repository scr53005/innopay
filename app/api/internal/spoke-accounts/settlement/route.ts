import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

type SettlementEnvironment = 'prod' | 'dev' | 'demo' | 'all';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

function defaultEnvironment(): SettlementEnvironment {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
    ? 'prod'
    : 'dev';
}

function parseEnvironment(value: string | null): SettlementEnvironment | null {
  if (!value) return defaultEnvironment();
  if (value === 'prod' || value === 'dev' || value === 'demo' || value === 'all') {
    return value;
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const environment = parseEnvironment(req.nextUrl.searchParams.get('environment'));
  if (!environment) {
    return NextResponse.json({ error: 'Invalid environment' }, { status: 400 });
  }

  const accounts = await prisma.spoke_account.findMany({
    where: {
      active: true,
      settlement_enabled: true,
      ...(environment === 'all' ? {} : { environment }),
      spoke: { active: true },
    },
    include: { spoke: true },
    orderBy: [{ environment: 'asc' }, { spoke_id: 'asc' }, { hive_account: 'asc' }],
  });

  return NextResponse.json({
    environment,
    accounts: accounts.map((account) => ({
      spoke_id: account.spoke_id,
      spoke_name: account.spoke.name,
      hive_account: account.hive_account,
      environment: account.environment,
      role: account.role,
    })),
  });
}
