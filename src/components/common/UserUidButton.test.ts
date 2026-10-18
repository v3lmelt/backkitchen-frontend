import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import { useToast } from '@/composables/useToast'
import UserUidButton from './UserUidButton.vue'

describe('UserUidButton', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); useToast().toasts.value = [] })

  it.each([false, true])('retains a selectable UID and reports clipboard failure (missing=%s)', async (missing) => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', missing ? {} : {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    const wrapper = mountWithPlugins(UserUidButton, { props: { userId: 42 } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toBe('UID 42')
    expect(wrapper.find('button').classes()).toContain('select-text')
    expect(useToast().toasts.value.map(({ type, message }) => ({ type, message }))).toEqual([
      { type: 'error', message: 'Copy failed. Select and copy the UID manually.' },
    ])
    wrapper.unmount()
  })
})
