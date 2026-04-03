import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

export function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false,
  })
}

export function mountWithPlugins(component: unknown, options: Record<string, unknown> = {}): VueWrapper {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = createTestI18n()
  return mount(component as never, {
    ...options,
    global: {
      plugins: [pinia, i18n, ...(((options.global as any)?.plugins ?? []) as any[])],
      stubs: {
        transition: false,
        ...(options.global as any)?.stubs,
      },
      ...(options.global as any),
    },
  })
}
