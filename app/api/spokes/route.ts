// API route to fetch active spokes from database
// GET /api/spokes - Returns all active spokes for display on hub

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const spokes = await prisma.spoke.findMany({
      where: {
        active: true,
      },
      orderBy: [
        { ready: 'desc' }, // Ready spokes first
        { name: 'asc' },   // Then alphabetically
      ],
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
        attribute_name_2: true,
        attribute_default_2: true,
        attribute_storage_key_2: true,
        attribute_name_3: true,
        attribute_default_3: true,
        attribute_storage_key_3: true,
        image_1: true,
        image_2: true,
        image_3: true,
        has_delivery: true,
        ready: true,
      },
    });

    return NextResponse.json({ spokes });
  } catch (error: any) {
    console.error('Error fetching spokes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spokes', details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
