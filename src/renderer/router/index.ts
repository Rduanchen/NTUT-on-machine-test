import { createMemoryHistory, createRouter } from 'vue-router';

import Settings from '../pages/Settings.vue';
import LoginPage from '../pages/LoginPage.vue';
import ExamPage from '../pages/ExamPage.vue';

const routes = [
  { path: '/', name: 'settings', component: Settings },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/exam', name: 'exam', component: ExamPage }
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes
});

/**
 * Navigation guard: restore the correct page after a renderer reload (Ctrl+R).
 *
 * createMemoryHistory always starts at '/' on every cold start / reload.
 * We check the main-process auth state and redirect accordingly:
 *   - verified student  → /exam
 *   - unverified        → stay on current target (settings or login)
 *
 * The guard also prevents a verified student from accidentally navigating
 * back to '/' or '/login', and prevents an unverified student from accessing '/exam'.
 */
router.beforeEach(async (to) => {
  const api = (window as any).api;
  const isVerified: boolean = (await api?.auth?.isVerified()) ?? false;

  // Verified student should always be on the exam page
  if (isVerified && (to.name === 'settings' || to.name === 'login')) {
    return { name: 'exam' };
  }

  // Unverified student must not access the exam page
  if (!isVerified && to.name === 'exam') {
    return { name: 'settings' };
  }

  // Otherwise allow navigation as-is
  return true;
});
