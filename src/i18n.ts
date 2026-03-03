import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    lng: typeof localStorage !== 'undefined' ? localStorage.getItem('omniboard_language') || undefined : undefined,
    defaultNS: 'core',
    ns: ['core'], // только core при старте; системные NS загружаются лениво
    backend: {
      loadPath: '/api/locales/{{lng}}/{{ns}}',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
