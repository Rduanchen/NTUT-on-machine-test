import type { Router } from 'vue-router';

import { derivePage, type DeviceState, type DerivedPage } from './phase-derivation';
import type { ExamState } from '../../common/types';

/**
 * Pages the derivation can ask for that do not exist yet.
 *
 * `standby` arrives with the INITIALIZED-phase work and `pending-approval`
 * with the re-entry work. Until then they fall back to the nearest existing
 * page so every checkpoint stays runnable. Delete an entry when its page
 * lands — leaving one behind would quietly keep sending students elsewhere.
 */
const NOT_YET_BUILT: Partial<Record<DerivedPage, DerivedPage>> = {
  standby: 'not-initialized',
  'pending-approval': 'login'
};

export function resolvePage(page: DerivedPage): string {
  return NOT_YET_BUILT[page] ?? page;
}

/** What this machine has achieved locally, read across the IPC boundary. */
export async function readDeviceState(api: any): Promise<DeviceState> {
  if (await api?.auth?.isVerified?.()) return 'LOGGED_IN';
  if (await api?.auth?.isRegistered?.()) return 'REGISTERED';
  return 'UNREGISTERED';
}

export async function readExamStatus(api: any): Promise<ExamState> {
  return (await api?.store?.getExamStatus?.()) ?? 'UNINITIALIZED';
}

/**
 * Send this machine to wherever the current phase and device state put it.
 *
 * Every page that used to keep its own phase-to-route chain calls this
 * instead. Those chains were five separate copies of one table, and they had
 * already drifted: some knew about `FINISHED`, some did not, and each had to be
 * found and edited whenever a phase was added.
 */
export async function goToDerivedPage(router: Router): Promise<void> {
  const api = (window as any).api;
  if (!api) return;

  const target = resolvePage(derivePage(await readExamStatus(api), await readDeviceState(api)));
  if (router.currentRoute.value.name !== target) {
    await router.replace({ name: target });
  }
}
