import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import BaseModal from './BaseModal.vue'
import ConfirmModal from './ConfirmModal.vue'

const mounted: VueWrapper[] = []
const inertDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert')
let opener: HTMLButtonElement
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(HTMLElement.prototype, 'inert', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('inert') },
    set(this: HTMLElement, value: boolean) { this.toggleAttribute('inert', value) },
  })
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.replaceChildren()
  if (inertDescriptor) Object.defineProperty(HTMLElement.prototype, 'inert', inertDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert')
  vi.useRealTimers()
})
async function settle() {
  await nextTick()
  await vi.runAllTimersAsync()
  await nextTick()
}
function modal(open = false) {
  const wrapper = mountWithPlugins(BaseModal, {
    attachTo: document.body,
    props: { open, closable: false },
    slots: { default: '<input aria-label="First"><button>Last</button>' },
    global: { stubs: { transition: false } },
  })
  mounted.push(wrapper)
  return wrapper
}
function key(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  document.activeElement!.dispatchEvent(event)
  return event
}

describe('BaseModal controlled lifecycle', () => {
  it('leaves focus and keyboard alone while closed and allows the parent to reject close', async () => {
    const wrapper = modal()
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(key('Escape').defaultPrevented).toBe(false)
    await wrapper.setProps({ open: true })
    await settle()
    key('Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('wraps focus in both directions and recovers focus from outside', async () => {
    modal(true)
    await settle()
    const first = document.querySelector('input')!
    const last = document.querySelector('[role="dialog"] button') as HTMLButtonElement
    expect(document.activeElement).toBe(first)
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
    key('Tab')
    expect(document.activeElement).toBe(first)
    opener.focus()
    key('Tab')
    expect(document.activeElement).toBe(first)
  })

  it('respects consumed Escape and composition and removes its listener on unmount', async () => {
    const wrapper = modal(true)
    await settle()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    document.activeElement!.dispatchEvent(event)
    key('Escape', { isComposing: true })
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(document.activeElement).toBe(opener)
    expect(key('Escape').defaultPrevented).toBe(false)
  })

  it('keeps a reopened dialog interactive and restores focus after the effective close', async () => {
    const wrapper = modal(true)
    await settle()
    await wrapper.setProps({ open: false })
    expect((document.querySelector('[role="dialog"]') as HTMLElement).inert).toBe(true)
    await wrapper.setProps({ open: true })
    await settle()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect((document.querySelector('[role="dialog"]') as HTMLElement).inert).toBe(false)
    expect(document.activeElement?.tagName).toBe('INPUT')
    await wrapper.setProps({ open: false })
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('lets the newer dialog retain focus while an older dialog exits', async () => {
    const a = modal(true)
    await settle()
    await a.setProps({ open: false })
    const b = modal(true)
    await settle()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.contains(document.activeElement)).toBe(true)
    key('Escape')
    expect(b.emitted('close')).toHaveLength(1)
    expect(a.emitted('close')).toBeUndefined()
  })
})

describe('ConfirmModal display snapshot', () => {
  it('retains the cleared target through exit and replaces it on rapid reopen', async () => {
    const wrapper = mountWithPlugins(ConfirmModal, {
      attachTo: document.body,
      props: { open: true, title: 'Delete Alpha', message: 'Alpha content' },
      global: { stubs: { transition: false } },
    })
    mounted.push(wrapper)
    await settle()
    await wrapper.setProps({ open: false, title: '', message: '' })
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Alpha content')
    await wrapper.setProps({ open: true, title: 'Delete Beta', message: 'Beta content' })
    await settle()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Beta content')
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Alpha content')
  })
})
