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
