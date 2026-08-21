import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTrackWebSocket } from './useTrackWebSocket'

enableAutoUnmount(afterEach)

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
  send = vi.fn()

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

function mountReactiveHarness(
  onTrackUpdated: () => void,
  onDiscussionEvent?: (event: string, discussionId: number) => void,
) {
  const activeTrackId = ref(12)
  const wrapper = mount(defineComponent({
    setup() {
      return {
        activeTrackId,
        ...useTrackWebSocket(activeTrackId, onTrackUpdated, { onDiscussionEvent }),
      }
    },
    template: '<div />',
  }))
  return { wrapper, activeTrackId }
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

    // Once from the socket open (fresh-data pull) and once from the broadcast.
    expect(onTrackUpdated).toHaveBeenCalledTimes(2)
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

  it('closes the old socket and reconnects when the route track changes', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const { activeTrackId } = mountReactiveHarness(vi.fn())
    const first = TestWebSocket.instances[0]

    activeTrackId.value = 42
    await nextTick()

    expect(first.close).toHaveBeenCalledTimes(1)
    expect(TestWebSocket.instances).toHaveLength(2)
    expect(TestWebSocket.instances[1].url).toContain('/ws/tracks/42?token=secret')
  })

  it('reconnects with the latest token after an auth change event', async () => {
    localStorage.setItem('backkitchen_token', 'old-token')
    mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]

    localStorage.setItem('backkitchen_token', 'new-token')
    window.dispatchEvent(new Event('backkitchen:auth-changed'))
    await nextTick()

    expect(first.close).toHaveBeenCalledTimes(1)
    expect(TestWebSocket.instances).toHaveLength(2)
    expect(TestWebSocket.instances[1].url).toContain('/ws/tracks/7?token=new-token')
  })

  it('re-pulls track data whenever the socket (re)connects', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const onTrackUpdated = vi.fn()
    mountHarness(7, onTrackUpdated)

    TestWebSocket.instances[0].emitOpen()
    await nextTick()
    expect(onTrackUpdated).toHaveBeenCalledTimes(1)

    // A drop + reconnect must trigger a fresh reload to backfill the gap.
    TestWebSocket.instances[0].emitClose()
    await nextTick()
    vi.advanceTimersByTime(2_000)
    expect(TestWebSocket.instances).toHaveLength(2)

    TestWebSocket.instances[1].emitOpen()
    await nextTick()
    expect(onTrackUpdated).toHaveBeenCalledTimes(2)
  })

  it('force-closes and reconnects when no message arrives within the heartbeat timeout', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]
    first.emitOpen()
    await nextTick()
    expect((wrapper.vm as any).connected).toBe(true)

    // 30s of silence is within the 90s timeout.
    vi.advanceTimersByTime(30_000)
    expect(first.close).not.toHaveBeenCalled()

    // Past three missed pings (>90s without any message) the heartbeat
    // force-closes the socket so the normal reconnect path takes over.
    vi.advanceTimersByTime(90_000)
    expect(first.close).toHaveBeenCalledTimes(1)

    // The browser then fires onclose → reconnect scheduled with initial delay.
    first.emitClose()
    await nextTick()
    expect((wrapper.vm as any).connected).toBe(false)
    vi.advanceTimersByTime(2_000)
    expect(TestWebSocket.instances).toHaveLength(2)
  })

  it('does not force-close while messages keep arriving', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]
    first.emitOpen()
    await nextTick()

    // Each tick refreshes lastMessageAt before the timeout can elapse, so the
    // heartbeat never declares the healthy socket dead.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(30_000)
      first.emitMessage({ type: 'track_updated', track_id: 7 })
    }

    expect(first.close).not.toHaveBeenCalled()
    expect(TestWebSocket.instances).toHaveLength(1)
    expect((wrapper.vm as any).connected).toBe(true)
  })

  it('clears the heartbeat timer when the socket is stopped', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const wrapper = mountHarness(7, vi.fn())
    const first = TestWebSocket.instances[0]
    first.emitOpen()
    await nextTick()

    wrapper.unmount() // stop() → closeSocket() → stopHeartbeat() + close()

    // Advancing far past the timeout must not close the socket again or
    // schedule a reconnect — the heartbeat timer was cleared.
    vi.advanceTimersByTime(200_000)
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(TestWebSocket.instances).toHaveLength(1)
  })
})
