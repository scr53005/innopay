import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./hatch-vendors', () => ({ farmRequest: mocks.request }));
import { isHatchCategoryAvailable, proxyFarmTemplates } from './hatch-templates';

beforeEach(() => { vi.clearAllMocks(); });

it('checks the current active list before hatching from a stale form', async () => {
  mocks.request.mockResolvedValue(new Response(JSON.stringify({ templates: [{ key: 'food_truck' }] })));
  expect(await isHatchCategoryAvailable('coffee_cart')).toBe(false);
  expect(mocks.request).toHaveBeenCalledWith('/api/templates');
});
it('does not treat a category-service failure as permission to hatch', async () => {
  mocks.request.mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(isHatchCategoryAvailable('coffee_cart')).rejects.toThrow('Cannot check');
});
it('preserves validation and duplicate errors from the protected Farm service', async () => {
  mocks.request.mockResolvedValue(new Response(JSON.stringify({ error: 'Category already exists' }), { status: 409 }));
  const response = await proxyFarmTemplates('', { method: 'POST', body: '{"name":"Coffee"}' });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'Category already exists' });
});
