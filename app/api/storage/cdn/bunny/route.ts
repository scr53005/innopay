import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const zone = process.env.BUNNY_STORAGE_ZONE; // e.g., 'innopay-lu'
    const password = process.env.BUNNY_STORAGE_PASSWORD; // Zone password/API key
    if (!zone || !password) {
      return NextResponse.json({ error: 'Bunny credentials not configured' }, { status: 500 });
    }

    // Bunny Storage upload via REST API: PUT to https://<zone>.b-cdn.net/<filename>
    const uploadUrl = `https://${zone}.b-cdn.net/${file.name}`;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': password,
        'Content-Type': file.type,
      },
      body: file, // Fetch handles File/Blob directly; no stream conversion needed
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    // On success (201 Created), file is accessible via URL; no GUID/body returned
    const cdnUrl = `https://cdn.innopay.lu/${file.name}`; // Your custom domain

    return NextResponse.json({
      success: true,
      url: cdnUrl,
      filename: file.name // For reference (use as identifier)
    });
  } catch (error: any) {
    console.error('Bunny upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}