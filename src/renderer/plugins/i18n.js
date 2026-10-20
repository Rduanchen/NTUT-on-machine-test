import { createI18n } from 'vue-i18n';

// Import your locale messages
import en from '../locales/en.json';
import zh from '../locales/zh.json';
// import another language like this
// import es from '../locales/es.json'

const i18n = createI18n({
  legacy: false, // You must set legacy to false to use Composition API
  locale: 'en', // Set default locale
  fallbackLocale: 'en', // Set fallback locale
  messages: {
    en,
    zh,
    'zh-TW': zh
  }
});

export default i18n;
