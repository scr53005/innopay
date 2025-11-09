// app/api/checkout/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { findGuestCheckoutBySessionId } from '@/services/database';

// Handle CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * GET /api/checkout/status?session_id=xxx
 * Check the status of a guest checkout (whether blockchain txs are complete)
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required' },
        {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': origin },
        }
      );
    }

    // Find the guest checkout record
    const checkout = await findGuestCheckoutBySessionId(sessionId);

    if (!checkout) {
      return NextResponse.json(
        { error: 'Checkout not found' },
        {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': origin },
        }
      );
    }

    // Determine if blockchain transactions are complete
    const isComplete =
      checkout.status === 'completed' ||
      checkout.status === 'completed_euro_fallback';

    const isPending = checkout.status === 'pending';

    return NextResponse.json(
      {
        sessionId: checkout.stripeSessionId,
        status: checkout.status,
        isComplete,
        isPending,
        hiveTxId: checkout.hiveTxId || null,
        euroTxId: checkout.hiveTxId || null, // Using hiveTxId as fallback - adjust if you have separate euroTxId field
        amount: checkout.amountEuro,
        recipient: checkout.recipient,
      },
      {
        headers: { 'Access-Control-Allow-Origin': origin },
      }
    );

  } catch (error: any) {
    console.error('[CHECKOUT STATUS API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check checkout status' },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': origin },
      }
    );
  }
}
