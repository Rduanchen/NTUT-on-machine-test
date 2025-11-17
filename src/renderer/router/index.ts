import { createMemoryHistory, createRouter } from 'vue-router';

import TestPage from '../pages/TestPage.vue';
import Settings from '../pages/Settings.vue';
import WelcomePage from '../pages/WelcomePage.vue';
// import AboutView from "./AboutView.vue";

const routes = [
  { path: '/', component: TestPage }
  //   { path: "/about", component: AboutView },
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes
});
