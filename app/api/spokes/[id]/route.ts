// API route to fetch a single spoke from database by ID
// GET /api/spokes/[id] - Returns spoke data for hub-and-spoke URL resolution

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const spoke = await prisma.spoke.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        domain_prod: true,
        port_dev: true,
        path: true,
        attribute_name_1: true,
        attribute_default_1: true,
        attribute_storage_key_1: true,
        active: true,
        ready: true,
      },
    });

    if (!spoke) {
      return NextResponse.json(
        { error: 'Spoke not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ spoke });
  } catch (error: any) {
    console.error('Error fetching spoke:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spoke', details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
