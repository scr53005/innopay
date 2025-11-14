// app/api/campaigns/active/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/campaigns/active
 * Returns the currently active campaign with available bonus slots
 *
 * Returns: {
 *   campaign: {
 *     id: number,
 *     name: string,
 *     minAmount50: number,
 *     bonus50: number,
 *     maxUsers50: number,
 *     remainingSlots50: number,
 *     minAmount100: number,
 *     bonus100: number,
 *     maxUsers100: number,
 *     remainingSlots100: number
 *   } | null
 * }
 */
export async function GET() {
  try {
    // Find active campaign that hasn't ended
    const campaign = await prisma.campaign.findFirst({
      where: {
        active: true,
        OR: [
          { endDate: null },
          { endDate: { gt: new Date() } }
        ]
      },
      include: {
        bonus: true // Include bonuses to count how many slots are used
      },
      orderBy: {
        startDate: 'desc' // Get most recent active campaign
      }
    });

    if (!campaign) {
      return NextResponse.json({ campaign: null });
    }

    // Count how many users have received each bonus tier
    const bonus50Count = campaign.bonus.filter(b =>
      b.bonusAmount.toNumber() === campaign.bonus50.toNumber()
    ).length;

    const bonus100Count = campaign.bonus.filter(b =>
      b.bonusAmount.toNumber() === campaign.bonus100.toNumber()
    ).length;

    // Calculate remaining slots
    const remainingSlots50 = Math.max(0, campaign.maxUsers50 - bonus50Count);
    const remainingSlots100 = Math.max(0, campaign.maxUsers100 - bonus100Count);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        minAmount50: campaign.minAmount50.toNumber(),
        bonus50: campaign.bonus50.toNumber(),
        maxUsers50: campaign.maxUsers50,
        remainingSlots50,
        minAmount100: campaign.minAmount100.toNumber(),
        bonus100: campaign.bonus100.toNumber(),
        maxUsers100: campaign.maxUsers100,
        remainingSlots100
      }
    });

  } catch (error: any) {
    console.error('[CAMPAIGNS] Error fetching active campaign:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch active campaign',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
