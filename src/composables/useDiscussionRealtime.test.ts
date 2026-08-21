import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import { useDiscussionRealtime } from './useDiscussionRealtime'

function mountSubscriber(handler: (event: string, discussionId: number) => void) {
  const Comp = defineComponent({
    setup() {
      const { subscribe } = useDiscussionRealtime()
      subscribe(handler)
      return () => null
    },
  })
  return mount(Comp)
}

describe('useDiscussionRealtime', () => {
  it('delivers dispatched events to all subscribers', () => {
    const first = vi.fn()
    const second = vi.fn()
    const w1 = mountSubscriber(first)
    const w2 = mountSubscriber(second)

    const { dispatch } = useDiscussionRealtime()
    dispatch('created', 42)

    expect(first).toHaveBeenCalledWith('created', 42)
    expect(second).toHaveBeenCalledWith('created', 42)
    w1.unmount()
    w2.unmount()
  })

  it('stops delivering to subscribers after they unmount', () => {
    const active = vi.fn()
    const gone = vi.fn()
    const w1 = mountSubscriber(active)
    const w2 = mountSubscriber(gone)

    w2.unmount()
    const { dispatch } = useDiscussionRealtime()
    dispatch('deleted', 7)

    expect(active).toHaveBeenCalledWith('deleted', 7)
    expect(gone).not.toHaveBeenCalled()
    w1.unmount()
  })
})
