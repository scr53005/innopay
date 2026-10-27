/** Server-side access to the Farm vendor registry. Never expose PROVISION_SECRET to the browser. */
export interface FarmVendor {
  handle: string;
  display_name: string;
  hive_account: string;
  is_active: boolean;
  logo_url?: string | null;
  created_at?: string;
}

function farmUrl(): string {
  return (process.env.INNOHATCH_URL || 'https://pay.innopay.lu').replace(/\/$/, '');
}

export async function farmRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const secret = process.env.PROVISION_SECRET;
  if (!secret) throw new Error('PROVISION_SECRET not configured');
  return fetch(`${farmUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
}

export async function getFarmVendor(handle: string): Promise<FarmVendor> {
  const response = await farmRequest(`/api/operator/vendors/${encodeURIComponent(handle)}`);
  if (!response.ok) throw new Error(`Farm vendor lookup failed (${response.status})`);
  const data = await response.json();
  return data.vendor as FarmVendor;
}

export async function setFarmVendorActive(handle: string, active: boolean): Promise<void> {
  const response = await farmRequest(`/api/operator/vendors/${encodeURIComponent(handle)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: active }),
  });
  if (!response.ok) throw new Error(`Farm vendor update failed (${response.status})`);
}
