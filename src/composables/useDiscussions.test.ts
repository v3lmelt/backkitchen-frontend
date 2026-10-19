import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { discussionApi } from '@/api'
import { useDiscussions, type UseDiscussionsOptions } from './useDiscussions'
import { createTestI18n } from '@/tests/utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Discussion } from '@/types'

function disc(id: number, content = `msg-${id}`): Discussion {
  return { id, track_id: 42, author_id: 2, created_at: '2026-10-18T00:00:00Z', content, images: [], audios: [] }
}

type Composable = ReturnType<typeof useDiscussions>

function mountHarness(options: UseDiscussionsOptions = {}) {
  let captured: Composable | null = null
  const trackId = ref(42)
  const Comp = defineComponent({
    setup() {
      captured = useDiscussions(trackId, 'general', options)
      return () => null
    },
  })
  setActivePinia(createPinia())
  const wrapper = mount(Comp, {
    global: { plugins: [createTestI18n()] },
  })
  return { wrapper, composable: captured as unknown as Composable, trackId }
}

describe('useDiscussions (paginated)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('load() fetches latest page and sets hasMore when page is full', async () => {
    const page = Array.from({ length: 20 }, (_, i) => disc(i + 1))
    const listMock = vi.spyOn(discussionApi, 'list').mockResolvedValue(page as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true })
    await composable.load()
    await flushPromises()

    expect(listMock).toHaveBeenCalledWith(42, 'general', { limit: 20 })
    expect(composable.discussions.value.map(d => d.id)).toEqual(page.map(d => d.id))
    expect(composable.hasMore.value).toBe(true)
    wrapper.unmount()
  })

  it('load() marks hasMore false when latest page is short', async () => {
    const page = Array.from({ length: 3 }, (_, i) => disc(i + 1))
    vi.spyOn(discussionApi, 'list').mockResolvedValue(page as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true })
    await composable.load()
    await flushPromises()

    expect(composable.hasMore.value).toBe(false)
    wrapper.unmount()
  })

  it('loadOlder() prepends older items using oldest id as cursor', async () => {
    const latest = Array.from({ length: 20 }, (_, i) => disc(i + 21))
    const older = Array.from({ length: 20 }, (_, i) => disc(i + 1))
    const listMock = vi.spyOn(discussionApi, 'list')
      .mockResolvedValueOnce(latest as unknown as never)
      .mockResolvedValueOnce(older as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true })
    await composable.load()
    await flushPromises()
    expect(composable.discussions.value[0].id).toBe(21)

    await composable.loadOlder()
    await flushPromises()

    expect(listMock).toHaveBeenLastCalledWith(42, 'general', { beforeId: 21, limit: 20 })
    expect(composable.discussions.value.map(d => d.id)).toEqual([...older, ...latest].map(d => d.id))
    expect(composable.hasMore.value).toBe(true)
    wrapper.unmount()
  })

  it('loadOlder() clears hasMore when older page is short', async () => {
    const latest = Array.from({ length: 20 }, (_, i) => disc(i + 5))
    const older = [disc(1), disc(2), disc(3), disc(4)]
    vi.spyOn(discussionApi, 'list')
      .mockResolvedValueOnce(latest as unknown as never)
      .mockResolvedValueOnce(older as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true })
    await composable.load()
    await composable.loadOlder()
    await flushPromises()

    expect(composable.hasMore.value).toBe(false)
    expect(composable.discussions.value[0].id).toBe(1)
    wrapper.unmount()
  })

  it('loadOlder() is a no-op when not paginated or no more pages', async () => {
    const listMock = vi.spyOn(discussionApi, 'list').mockResolvedValue([disc(1)] as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: false })
    await composable.load()
    listMock.mockClear()

    await composable.loadOlder()
    await flushPromises()

    expect(listMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('applyRealtimeEvent("deleted") filters the matching id out of the list', async () => {
    const page = [disc(1), disc(2), disc(3)]
    vi.spyOn(discussionApi, 'list').mockResolvedValue(page as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true })
    await composable.load()
    await composable.applyRealtimeEvent('deleted', 2)
    await flushPromises()

    expect(composable.discussions.value.map(d => d.id)).toEqual([1, 3])
    wrapper.unmount()
  })

  it('applyRealtimeEvent("created") merges newer items without rewinding older ones', async () => {
    const initialLatest = [disc(1), disc(2), disc(3)]
    const afterCreate = [disc(2), disc(3), disc(4)]
    const listMock = vi.spyOn(discussionApi, 'list')
      .mockResolvedValueOnce(initialLatest as unknown as never)
      .mockResolvedValueOnce(afterCreate as unknown as never)

    const { composable, wrapper } = mountHarness({ paginated: true, pageSize: 3 })
    await composable.load()
    await composable.applyRealtimeEvent('created', 4)
    await flushPromises()

    expect(listMock).toHaveBeenLastCalledWith(42, 'general', { limit: 3 })
    expect(composable.discussions.value.map(d => d.id)).toEqual([1, 2, 3, 4])
    wrapper.unmount()
  })

  it('non-paginated load() returns the whole list and leaves hasMore false', async () => {
    const all = Array.from({ length: 50 }, (_, i) => disc(i + 1))
    vi.spyOn(discussionApi, 'list').mockResolvedValue(all)

    const { composable, wrapper } = mountHarness({ paginated: false })
    await composable.load()
    await flushPromises()

    expect(composable.discussions.value).toHaveLength(50)
    expect(composable.hasMore.value).toBe(false)
    wrapper.unmount()
  })

  it('returns a successful discussion even when realtime already inserted it, and returns null on failure', async () => {
    const created = disc(9)
    const pending = Promise.withResolvers<Discussion>()
    vi.spyOn(discussionApi, 'create').mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('offline'))
    const { composable, wrapper } = mountHarness()
    const result = composable.submit({ content: 'draft', images: [], audios: [] })
    composable.discussions.value = [created]
    pending.resolve(created)
    expect(await result).toBe(created)
    expect(composable.discussions.value.map(d => d.id)).toEqual([9])
    expect(await composable.submit({ content: 'retry', images: [], audios: [] })).toBeNull()
    expect(composable.discussions.value.map(d => d.id)).toEqual([9])
    wrapper.unmount()
  })

  it('isolates old list and submit responses after switching tracks', async () => {
    const oldList = Promise.withResolvers<Discussion[]>()
    const oldSubmit = Promise.withResolvers<Discussion>()
    vi.spyOn(discussionApi, 'list').mockReturnValueOnce(oldList.promise).mockResolvedValueOnce([disc(80)])
    vi.spyOn(discussionApi, 'create').mockReturnValueOnce(oldSubmit.promise)
    const { composable, wrapper, trackId } = mountHarness()
    const loading = composable.load()
    const posting = composable.submit({ content: 'old track', images: [], audios: [] })
    trackId.value = 8
    await composable.load()
    oldList.resolve([disc(1)])
    oldSubmit.resolve(disc(2))
    await Promise.all([loading, posting])
    expect(composable.discussions.value.map(d => d.id)).toEqual([80])
    expect(composable.posting.value).toBe(false)
    wrapper.unmount()
  })
})

