import { createMemoryHistory, createRouter } from 'vue-router';

import TestPage from '../pages/TestPage.vue';
import Settings from '../pages/Settings.vue';
import WelcomePage from '../pages/WelcomePage.vue';
import path from 'path';
// import AboutView from "./AboutView.vue";

const routes = [
  { path: '/', component: Settings },
  { path: '/Welcome', component: WelcomePage },
  { path: '/TestPage', component: TestPage }
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes
});
