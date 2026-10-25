import { describe, expect, it, vi } from 'vitest';
import { transitionVendor } from './vendor-archive-transition';

describe('vendor archive transition', () => {
  it('closes the Farm before disabling hub payment and the watcher', async () => {
    const calls: string[] = [];
    const steps = {
      setFarmActive: vi.fn(async (value: boolean) => { calls.push(`farm:${value}`); }),
      setHubActive: vi.fn(async (value: boolean) => { calls.push(`hub:${value}`); }),
      setWatcherActive: vi.fn(async (value: boolean) => { calls.push(`watch:${value}`); }),
    };
    await transitionVendor('archive', steps, []);
    expect(calls).toEqual(['farm:false', 'hub:false', 'watch:false']);
  });

  it('leaves the Farm closed if watcher registration fails during unarchive', async () => {
    const calls: string[] = [];
    const steps = {
      setFarmActive: vi.fn(async (value: boolean) => { calls.push(`farm:${value}`); }),
      setHubActive: vi.fn(async (value: boolean) => { calls.push(`hub:${value}`); }),
      setWatcherActive: vi.fn(async () => { calls.push('watch'); throw new Error('offline'); }),
    };
    await expect(transitionVendor('unarchive', steps, [])).rejects.toThrow('offline');
    expect(calls).toEqual(['hub:true', 'watch']);
    expect(steps.setFarmActive).not.toHaveBeenCalled();
  });
});
