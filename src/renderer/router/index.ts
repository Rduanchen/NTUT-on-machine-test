import { createMemoryHistory, createRouter } from 'vue-router';

import Settings from '../pages/Settings.vue';
import LoginPage from '../pages/LoginPage.vue';
import ExamPage from '../pages/ExamPage.vue';
import NotInitializedPage from '../pages/NotInitializedPage.vue';
import WaitingForExamPage from '../pages/WaitingForExamPage.vue';
import ExamFinishedPage from '../pages/ExamFinishedPage.vue';
import StandbyPage from '../pages/StandbyPage.vue';
import { getEnvironmentNavigationDecision } from './environment-check.guard';
import { derivePage, isSettingsReachable } from './phase-derivation';
import { readDeviceState, readExamStatus, resolvePage } from './navigate';
import { isBuffering, bufferEndTime } from '../constants/bufferState';
import type { ExamState } from '../../common/types';

const routes = [
  { path: '/', name: 'settings', component: Settings },
  { path: '/not-initialized', name: 'not-initialized', component: NotInitializedPage },
  { path: '/standby', name: 'standby', component: StandbyPage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/waiting', name: 'waiting', component: WaitingForExamPage },
  { path: '/exam', name: 'exam', component: ExamPage },
  { path: '/finished', name: 'finished', component: ExamFinishedPage }
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes
});

/**
 * Navigation guard: the page is derived, never remembered.
 *
 * Everything the student side knows about where it belongs comes from two
 * inputs — the global phase and what this machine has achieved locally. There
 * is no client-side phase left to fall out of step with the backend, and no
 * "go back a step" path is needed: clearing the device state and re-deriving
 * lands in the right place on its own.
 *
 * These rules are a convenience, not a boundary. The backend refuses
 * out-of-phase requests itself (`exam-phase.middleware.ts`); this only avoids
 * showing a student a page that cannot work.
 */
router.beforeEach(async (to) => {
  const api = (window as any).api;
  if (!api) return true;

  const examStatus: ExamState = await readExamStatus(api);
  const device = await readDeviceState(api);

  const environmentResponse = await api?.environmentCheck?.getReport?.();
  const environmentStatus = environmentResponse?.data?.status ?? 'IDLE';
  const environmentDecision = getEnvironmentNavigationDecision({
    targetName: to.name,
    status: environmentStatus,
    examStatus,
    isVerified: device === 'LOGGED_IN'
  });
  if (environmentDecision !== true) return environmentDecision;

  if (to.name === 'settings') {
    /* Settings can repoint the backend URL and load a paper from a file. Once
     * students are in the room, that is a way for one of them to detach their
     * machine from every server-side control — force logout, phase broadcasts,
     * violation reporting — while still answering questions, and from the
     * invigilator's console it looks exactly like a dropped connection. */
    if (!isSettingsReachable(examStatus)) {
      return { name: resolvePage(derivePage(examStatus, device)) };
    }
    return true;
  }

  /* The collection window: the exam is over, but an upload already under way
   * is allowed to finish rather than being thrown off the page mid-request. */
  if (
    examStatus === 'FINISHED' &&
    to.name === 'exam' &&
    isBuffering.value &&
    Date.now() < bufferEndTime.value
  ) {
    return true;
  }

  const target = resolvePage(derivePage(examStatus, device));
  return to.name === target ? true : { name: target };
});
