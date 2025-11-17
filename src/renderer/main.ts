// import './assets/main.css'
import { createApp } from 'vue';
import App from './App.vue';
// import i18n from './plugins/i18n';
import router from './router';
import vuetify from './plugins/vuetify.js';

const app = createApp(App);

// app.use(i18n);

app.use(vuetify);
app.use(router);
app.mount('#app');
