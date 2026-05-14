import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const key = process.env.LIMAN_API_KEY;
  if (!key) return false;
  return auth === `Bearer ${key}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { debt_ids } = await req.json() as { debt_ids?: string[] };
  if (!debt_ids || !Array.isArray(debt_ids) || debt_ids.length === 0) {
    return NextResponse.json({ error: 'debt_ids required (non-empty array)' }, { status: 400 });
  }

  const debts = await prisma.outstanding_debt.findMany({
    where: { id: { in: debt_ids } },
    orderBy: { created_at: 'asc' },
  });

  return NextResponse.json({ debts });
}
