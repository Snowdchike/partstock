import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('pbx_lang')) || 'vi';

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: stored,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLang(lang: string) {
  void i18n.changeLanguage(lang);
  if (typeof localStorage !== 'undefined') localStorage.setItem('pbx_lang', lang);
}

export default i18n;
