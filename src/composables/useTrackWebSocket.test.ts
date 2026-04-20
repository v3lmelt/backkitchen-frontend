import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTrackWebSocket } from './useTrackWebSocket'

class TestWebSocket {
  static instances: TestWebSocket[] = []
  static OPEN = 1

  readyState = 1
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  close = vi.fn(() => {
    this.readyState = 3
  })

  url: string

  constructor(url: string) {
    this.url = url
    TestWebSocket.instances.push(this)
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent)
  }

  emitClose() {
    this.readyState = 3
    this.onclose?.({} as CloseEvent)
  }
}

function mountHarness(
  trackId: number,
  onTrackUpdated: () => void,
  onDiscussionEvent?: (event: string, discussionId: number) => void,
) {
  return mount(defineComponent({
    setup() {
      return useTrackWebSocket(trackId, onTrackUpdated, { onDiscussionEvent })
    },
    template: '<div />',
  }))
}

describe('useTrackWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', TestWebSocket as unknown as typeof WebSocket)
    TestWebSocket.instances = []
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    TestWebSocket.instances = []
    localStorage.clear()
  })

  it('does not open a socket when there is no stored token', () => {
    const wrapper = mountHarness(12, vi.fn())

    expect(TestWebSocket.instances).toHaveLength(0)
    expect((wrapper.vm as any).connected).toBe(false)
  })

  it('connects and dispatches track/discussion events only for the active track', async () => {
    localStorage.setItem('backkitchen_token', 'secret token')
    const onTrackUpdated = vi.fn()
    const onDiscussionEvent = vi.fn()
    const wrapper = mountHarness(12, onTrackUpdated, onDiscussionEvent)

    expect(TestWebSocket.instances).toHaveLength(1)
    expect(TestWebSocket.instances[0].url).toContain('/ws/tracks/12?token=secret token')

    TestWebSocket.instances[0].emitOpen()
    await nextTick()
    expect((wrapper.vm as any).connected).toBe(true)

    TestWebSocket.instances[0].emitMessage({ type: 'track_updated', track_id: 12 })
    TestWebSocket.instances[0].emitMessage({ type: 'track_updated', track_id: 99 })
    TestWebSocket.instances[0].emitMessage({ type: 'discussion_event', track_id: 12, event: 'created', discussion_id: 44 })
    TestWebSocket.instances[0].emitMessage('not-json')

    expect(onTrackUpdated).toHaveBeenCalledTimes(1)
    expect(onDiscussionEvent).toHaveBeenCalledWith('created', 44)
  })

  it('reconnects after close and stops reconnecting after unmount', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]

    first.emitClose()
    await nextTick()

    expect((wrapper.vm as any).connected).toBe(false)
    vi.advanceTimersByTime(1999)
    expect(TestWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(TestWebSocket.instances).toHaveLength(2)

    const second = TestWebSocket.instances[1]
    wrapper.unmount()
    second.emitClose()
    vi.advanceTimersByTime(10000)

    expect(second.close).toHaveBeenCalledTimes(1)
    expect(TestWebSocket.instances).toHaveLength(2)
  })

  it('tracks reconnect attempts and resets on open', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]
    expect((wrapper.vm as any).reconnectAttempts).toBe(0)

    first.emitClose()
    await nextTick()
    expect((wrapper.vm as any).reconnectAttempts).toBe(1)

    vi.advanceTimersByTime(2000)
    expect(TestWebSocket.instances).toHaveLength(2)
    TestWebSocket.instances[1].emitOpen()
    await nextTick()
    expect((wrapper.vm as any).reconnectAttempts).toBe(0)
  })

  it('retry() reconnects immediately without waiting for backoff', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]

    first.emitClose()
    await nextTick()
    expect(TestWebSocket.instances).toHaveLength(1)

    ;(wrapper.vm as any).retry()
    await nextTick()
    expect(TestWebSocket.instances).toHaveLength(2)
  })
})
