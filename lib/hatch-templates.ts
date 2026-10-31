import { NextResponse } from 'next/server';
import { farmRequest } from './hatch-vendors';

export async function isHatchCategoryAvailable(key: string): Promise<boolean> {
  const response = await farmRequest('/api/templates');
  if (!response.ok) throw new Error('Cannot check Farm categories. Retry before hatching.');
  const data = await response.json();
  return Array.isArray(data.templates) && data.templates.some((t: { key: string }) => t.key === key);
}

// Every caller lives under the existing /api/hatch operator middleware gate.
export async function proxyFarmTemplates(path: string, init: RequestInit = {}) {
  try {
    const response = await farmRequest(`/api/templates${path}`, init);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error('[HATCH CATEGORIES] Farm unavailable', e);
    return NextResponse.json({ error: 'Cannot reach Innopay Farm. Please retry.', templates: [] }, { status: 502 });
  }
}
