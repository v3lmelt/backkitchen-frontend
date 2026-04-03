import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'

const LOCALE_KEY = 'backkitchen_locale'
const savedLocale = localStorage.getItem(LOCALE_KEY) ?? 'zh-CN'

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { 'zh-CN': zhCN, en },
})
