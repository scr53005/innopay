import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const strategy = formData.get('strategy') as 'fast' | 'pure';
    const file = formData.get('file') as File;

    if (!strategy || !file) {
      return NextResponse.json({ error: 'Missing strategy or file' }, { status: 400 });
    }

    // Delegate to specific handler
    const handlerUrl = strategy === 'fast' ? '/api/storage/cdn/bunny' : '/api/storage/ipfs';
    const handlerResponse = await fetch(`${handlerUrl}`, {
      method: 'POST',
      body: formData,
    });

    if (!handlerResponse.ok) {
      const errorData = await handlerResponse.json();
      return NextResponse.json({ error: errorData.error }, { status: handlerResponse.status });
    }

    const { uri } = await handlerResponse.json();
    return NextResponse.json({ uri });
  } catch (error: any) {
    console.error('Storage abstraction error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}