// POST /api/currency/batch
// Returns EUR/USD conversion rates for specific dates (used by spoke reporting pages).
// Body: { dates: ["2026-01-15", "2026-01-22", ...] }
// Response: { rates: { "2026-01-15": 1.0834, ... } }

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dates } = body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty dates array' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const d of dates) {
      if (typeof d !== 'string' || !dateRegex.test(d)) {
        return NextResponse.json(
          { error: `Invalid date format: ${d}. Use YYYY-MM-DD.` },
          { status: 400, headers: corsHeaders() }
        );
      }
    }

    // Cap at 366 unique dates (one year max)
    const uniqueDates = [...new Set(dates)].slice(0, 366);

    const rateMap = await fetchRatesForDates(uniqueDates);

    // Convert Map to plain object for JSON serialization
    const rates: Record<string, number> = {};
    for (const [date, rate] of rateMap) {
      rates[date] = rate;
    }

    return NextResponse.json({ rates }, { headers: corsHeaders() });
  } catch (error: any) {
    console.error('[CURRENCY BATCH] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch rates', details: error.message },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * Fetches EUR/USD rates for a specific set of dates.
 *
 * Strategy:
 * 1. Batch-query currencyConversion table for all requested dates
 * 2. For missing dates (weekends, holidays), use the nearest preceding rate in DB
 * 3. If no preceding rate exists, use the earliest available rate
 * 4. Falls back to 1.0 if no rates in DB at all
 *
 * Adapted from indiesmenu/lib/currency-service.ts fetchRatesForDates()
 */
async function fetchRatesForDates(dates: string[]): Promise<Map<string, number>> {
  const rateMap = new Map<string, number>();
  if (dates.length === 0) return rateMap;

  // Step 1: Batch-query DB for all requested dates
  const dateObjects = dates.map(d => new Date(d + 'T00:00:00.000Z'));
  try {
    const existingRates = await prisma.currencyConversion.findMany({
      where: {
        date: { in: dateObjects },
      },
    });

    for (const rate of existingRates) {
      const dateStr = rate.date.toISOString().split('T')[0];
      rateMap.set(dateStr, parseFloat(rate.conversionRate.toString()));
    }
  } catch (dbError) {
    console.warn('[CURRENCY BATCH] Failed to batch-fetch rates from DB:', dbError);
  }

  // Step 2: For missing dates, find the nearest preceding rate in DB
  const missingDates = dates.filter(d => !rateMap.has(d));

  for (const dateStr of missingDates) {
    try {
      const nearestRate = await prisma.currencyConversion.findFirst({
        where: {
          date: { lte: new Date(dateStr + 'T23:59:59.999Z') },
        },
        orderBy: { date: 'desc' },
      });

      if (nearestRate) {
        rateMap.set(dateStr, parseFloat(nearestRate.conversionRate.toString()));
      } else {
        // No rate before this date — try the earliest available
        const earliestRate = await prisma.currencyConversion.findFirst({
          orderBy: { date: 'asc' },
        });
        if (earliestRate) {
          rateMap.set(dateStr, parseFloat(earliestRate.conversionRate.toString()));
        } else {
          console.warn(`[CURRENCY BATCH] No rate found for ${dateStr}, using default 1.0`);
          rateMap.set(dateStr, 1.0);
        }
      }
    } catch (dbError) {
      console.warn(`[CURRENCY BATCH] Failed to find nearest rate for ${dateStr}:`, dbError);
      rateMap.set(dateStr, 1.0);
    }
  }

  return rateMap;
}
