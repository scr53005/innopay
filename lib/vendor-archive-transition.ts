export type VendorAction = 'archive' | 'unarchive';

export interface ArchiveSteps {
  setFarmActive(active: boolean): Promise<void>;
  setHubActive(active: boolean): Promise<void>;
  setWatcherActive(active: boolean): Promise<void>;
}

/** Fail-safe order: close the till first; reopen it only after payment plumbing. */
export async function transitionVendor(action: VendorAction, steps: ArchiveSteps, completed: string[]): Promise<void> {
  if (action === 'archive') {
    await steps.setFarmActive(false);
    completed.push('Farm disabled');
    await steps.setHubActive(false);
    completed.push('hub account disabled');
    await steps.setWatcherActive(false);
    completed.push('merchant watcher removed');
  } else {
    await steps.setHubActive(true);
    completed.push('hub account enabled');
    await steps.setWatcherActive(true);
    completed.push('merchant watcher registered');
    await steps.setFarmActive(true);
    completed.push('Farm enabled');
  }
}
