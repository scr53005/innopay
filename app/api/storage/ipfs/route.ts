import { NextRequest, NextResponse } from 'next/server';
import * as Client from '@storacha/client';
import { StoreMemory } from '@storacha/client/stores/memory';
import * as Proof from '@storacha/client/proof';
import { Signer } from '@storacha/client/principal/ed25519';

export async function POST(request: NextRequest) {
    // Minimal stub/mock: Returns success without any dependencies or operations
  return NextResponse.json({ 
    success: true, 
    uri: 'mock://ipfs/empty', 
    cid: 'mock-cid' 
  });
  /* try {
    // Load client with specific private key
    if (process.env.STORACHA_KEY === undefined) {
      throw new Error('STORACHA_KEY not set');
    }
    if (process.env.STORACHA_PROOF === undefined) {
      throw new Error('STORACHA_PROOF not set');
    }
    const principal = Signer.parse(process.env.STORACHA_KEY);
    const store = new StoreMemory();
    const client = await Client.create({ principal, store });
    // Add proof that this agent has been delegated capabilities on the space
    const proof = await Proof.parse(process.env.STORACHA_PROOF);
    const space = await client.addSpace(proof);
    await client.setCurrentSpace(space.did());

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload file to the space (returns CID)
    const cid = await client.uploadFile(file);

    const ipfsUri = `ipfs://${cid}/${file.name}`;
    
    return NextResponse.json({ 
      success: true, 
      uri: ipfsUri, 
      cid // For reference
    });
  } catch (error: any) {
    console.error('Storacha upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
    */
}