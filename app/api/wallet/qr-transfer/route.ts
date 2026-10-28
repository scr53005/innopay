import { NextRequest, NextResponse } from 'next/server';
import { Client, PrivateKey } from '@hiveio/dhive';
import { parseQrRequest, QrRequestError, type QrTransfer } from '../../../../lib/qr-request';

export const runtime = 'nodejs';
const client = new Client(['https://api.hive.blog', 'https://api.deathwing.me', 'https://hive-api.arcange.eu'], { timeout: 15000, failoverThreshold: 3 });

/** Independent QR transfer path. Never uses the hub's authority or order-payment APIs. */
export async function POST(req: NextRequest) {
  // Refuse cross-origin signing and insecure transmission of the user's active key.
  if (req.headers.get('origin') !== req.nextUrl.origin || (req.nextUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(req.nextUrl.hostname))) {
    return NextResponse.json({ status: 'rejected' }, { status: 403 });
  }
  let raw: string;
  let accountName: string;
  let activePrivateKey: string;
  try {
    const text = await req.text();
    if (text.length > 16000) throw new Error('oversize');
    const body = JSON.parse(text);
    if (typeof body.raw !== 'string' || typeof body.accountName !== 'string' || typeof body.activePrivateKey !== 'string' || !/^5[1-9A-HJ-NP-Za-km-z]{50}$/.test(body.activePrivateKey)) throw new Error('invalid request');
    ({ raw, accountName, activePrivateKey } = body);
  } catch {
    return NextResponse.json({ status: 'rejected' }, { status: 400 });
  }
  let request: QrTransfer;
  let key: PrivateKey;
  try {
    const parsed = parseQrRequest(raw, accountName);
    if (parsed.kind !== 'transfer') throw new Error('not a transfer');
    request = parsed;
    key = PrivateKey.fromString(activePrivateKey);
  } catch (error) {
    return NextResponse.json({ status: 'rejected', code: error instanceof QrRequestError ? error.code : 'invalidQr' }, { status: 400 });
  }
  try {
    const result = await client.broadcast.sendOperations([request.operation], key);
    return NextResponse.json({ status: 'submitted', txId: result.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // A lost RPC response can follow a successful submission. Never retry automatically.
    // Do not log the request or exception: either may contain the supplied private key.
    console.error('[QR TRANSFER] Submission outcome unknown; no automatic retry.');
    return NextResponse.json({ status: 'unknown' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
