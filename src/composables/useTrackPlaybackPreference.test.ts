import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { trackApi } from '@/api'

import { useTrackPlaybackPreference } from './useTrackPlaybackPreference'

const Harness = defineComponent({
  props: {
    trackId: { type: Number, required: false, default: null },
    userId: { type: Number, required: false, default: null },
    enabled: { type: Boolean, required: false, default: true },
    scope: { type: String, required: true },
  },
  setup(props) {
    return useTrackPlaybackPreference({
      trackId: () => props.trackId,
      userId: () => props.userId,
      enabled: () => props.enabled,
      scope: () => props.scope as 'source' | 'master',
    })
  },
  template: '<div />',
})

function preferenceKey(userId: number, trackId: number, scope: 'source' | 'master') {
  return `backkitchen_track_playback_preference_${userId}_${trackId}_${scope}`
}

describe('useTrackPlaybackPreference', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('hydrates from cache first, then syncs and clamps the server value', async () => {
    const key = preferenceKey(9, 42, 'source')
    localStorage.setItem(key, JSON.stringify({
      track_id: 42,
      user_id: 9,
      scope: 'source',
      gain_db: 99,
      updated_at: '2026-04-16T00:00:00Z',
    }))

    let resolveServerPreference: ((value: {
      track_id: number
      user_id: number
      scope: 'source'
      gain_db: number
      updated_at: string
    }) => void) | null = null
    vi.spyOn(trackApi, 'getPlaybackPreference').mockImplementation(() => new Promise<{
      track_id: number
      user_id: number
      scope: 'source'
      gain_db: number
      updated_at: string
    }>((resolve) => {
      resolveServerPreference = resolve
    }))

    const wrapper = mount(Harness, {
      props: { trackId: 42, userId: 9, scope: 'source' },
    })

    await nextTick()

    expect((wrapper.vm as any).gainDb).toBe(24)
    expect((wrapper.vm as any).isLoading).toBe(true)

    resolveServerPreference?.({
      track_id: 42,
      user_id: 9,
      scope: 'source',
      gain_db: -30,
      updated_at: '2026-04-16T00:05:00Z',
    })
    await flushPromises()

    expect(trackApi.getPlaybackPreference).toHaveBeenCalledWith(42, 'source')
    expect((wrapper.vm as any).gainDb).toBe(-24)
    expect((wrapper.vm as any).isLoading).toBe(false)
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({
      gain_db: -24,
      updated_at: '2026-04-16T00:05:00Z',
    })
  })

  it('flushes a pending save immediately when the playback context changes', async () => {
    vi.spyOn(trackApi, 'getPlaybackPreference')
      .mockResolvedValueOnce({
        track_id: 1,
        user_id: 9,
        scope: 'source',
        gain_db: 0,
        updated_at: null,
      })
      .mockResolvedValueOnce({
        track_id: 2,
        user_id: 9,
        scope: 'source',
        gain_db: 3.25,
        updated_at: null,
      })

    vi.spyOn(trackApi, 'setPlaybackPreference').mockResolvedValue({
      track_id: 1,
      user_id: 9,
      scope: 'source',
      gain_db: 5.6,
      updated_at: '2026-04-16T00:10:00Z',
    })

    const wrapper = mount(Harness, {
      props: { trackId: 1, userId: 9, scope: 'source' },
    })

    await flushPromises()

    ;(wrapper.vm as any).setGainDb(5.55)
    await wrapper.setProps({ trackId: 2 })
    await flushPromises()

    expect(trackApi.setPlaybackPreference).toHaveBeenCalledWith(1, 'source', {
      gain_db: 5.6,
    })
    expect(trackApi.getPlaybackPreference).toHaveBeenNthCalledWith(2, 2, 'source')
    expect(JSON.parse(localStorage.getItem(preferenceKey(9, 1, 'source')) ?? '{}')).toMatchObject({
      gain_db: 5.6,
    })
    expect((wrapper.vm as any).gainDb).toBe(3.3)
  })

  it('flushes on unmount and persists a fallback cache entry when saving fails', async () => {
    vi.spyOn(trackApi, 'getPlaybackPreference').mockResolvedValue({
      track_id: 7,
      user_id: 4,
      scope: 'master',
      gain_db: 0,
      updated_at: null,
    })
    vi.spyOn(trackApi, 'setPlaybackPreference').mockRejectedValue(new Error('save failed'))

    const wrapper = mount(Harness, {
      props: { trackId: 7, userId: 4, scope: 'master' },
    })

    await flushPromises()

    ;(wrapper.vm as any).setGainDb(99)
    wrapper.unmount()
    await flushPromises()

    expect(trackApi.setPlaybackPreference).toHaveBeenCalledWith(7, 'master', {
      gain_db: 24,
    })
    expect(JSON.parse(localStorage.getItem(preferenceKey(4, 7, 'master')) ?? '{}')).toMatchObject({
      track_id: 7,
      user_id: 4,
      scope: 'master',
      gain_db: 24,
      updated_at: null,
    })
  })
})
