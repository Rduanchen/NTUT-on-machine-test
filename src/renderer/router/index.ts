import { createMemoryHistory, createRouter } from 'vue-router';

import Settings from '../pages/Settings.vue';
import LoginPage from '../pages/LoginPage.vue';
import ExamPage from '../pages/ExamPage.vue';
import NotInitializedPage from '../pages/NotInitializedPage.vue';
import WaitingForExamPage from '../pages/WaitingForExamPage.vue';
import ExamFinishedPage from '../pages/ExamFinishedPage.vue';

const routes = [
  { path: '/', name: 'settings', component: Settings },
  { path: '/not-initialized', name: 'not-initialized', component: NotInitializedPage },
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
 * Navigation guard: enforce lifecycle-aware routing.
 *
 * State machine:
 *   UNINITIALIZED → /not-initialized
 *   NOT_STARTED   → /login (IP auto-login attempt) or /waiting (after login)
 *   IN_PROGRESS   → /exam
 *   FINISHED      → /finished
 *
 * Rules:
 *   - Verified student cannot go back to settings/login.
 *   - Unverified student cannot access /exam, /waiting, or /finished.
 *   - /settings (config page) is always accessible for initial setup.
 */
router.beforeEach(async (to) => {
  const api = (window as any).api;
  if (!api) return true;

  const isVerified: boolean = (await api?.auth?.isVerified()) ?? false;
  const examStatus: string = (await api?.store?.getExamStatus?.()) ?? 'UNINITIALIZED';

  // Always allow settings (needed for initial backend URL config)
  if (to.name === 'settings') {
    if (api?.config?.hasBackendUrl) {
      const hasUrl = await api.config.hasBackendUrl();
      if (hasUrl) {
        if (examStatus === 'UNINITIALIZED') return { name: 'not-initialized' };
        if (examStatus === 'NOT_STARTED') return { name: 'login' };
        if (examStatus === 'IN_PROGRESS') return isVerified ? { name: 'exam' } : { name: 'login' };
        if (examStatus === 'FINISHED') return { name: 'finished' };
      }
    }
    return true;
  }

  // Redirect to correct page based on exam status
  if (examStatus === 'UNINITIALIZED' && to.name !== 'not-initialized') {
    return { name: 'not-initialized' };
  }

  if (examStatus === 'FINISHED' && to.name !== 'finished') {
    return { name: 'finished' };
  }

  if (examStatus === 'IN_PROGRESS') {
    if (!isVerified && to.name !== 'settings') {
      return { name: 'settings' };
    }
    if (isVerified && (to.name === 'login' || to.name === 'not-initialized' || to.name === 'waiting')) {
      return { name: 'exam' };
    }
  }

  if (examStatus === 'NOT_STARTED') {
    if (isVerified && to.name === 'login') {
      return { name: 'waiting' };
    }
    if (!isVerified && (to.name === 'exam' || to.name === 'waiting' || to.name === 'finished')) {
      return { name: 'login' };
    }
  }

  return true;
});
