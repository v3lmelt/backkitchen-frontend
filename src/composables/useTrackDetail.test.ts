import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  trackApi: { get: mocks.getMock, listAssignments: mocks.listAssignmentsMock },
}))

import { useTrackDetail, fetchTrackDetailBundle } from './useTrackDetail'
import { useTrackStore } from '@/stores/tracks'

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    track: { id: 1, title: 'Track A', workflow_cycle: 2 },
    issues: [
      { id: 1, title: 'old cycle', workflow_cycle: 1 },
      { id: 2, title: 'current cycle', workflow_cycle: 2 },
    ],
    checklist_items: [],
    events: [],
    source_versions: [],
    master_deliveries: [],
    workflow_config: null,
    ...overrides,
  } as any
}

describe('useTrackDetail', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.getMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
    mocks.listAssignmentsMock.mockResolvedValue([])
  })

  it('applies the detail payload and filters issues to the current workflow_cycle', async () => {
    const store = useTrackStore()
    mocks.getMock.mockResolvedValue(makeDetail())
    mocks.listAssignmentsMock.mockResolvedValue([{ id: 9 }])

    const { track, issues, allIssues, mentionCandidates, reviewAssignments, loading, loadError, load } = useTrackDetail(ref(1))
    expect(loading.value).toBe(true)

    await load()

    expect(mocks.getMock).toHaveBeenCalledWith(1)
    expect(track.value?.title).toBe('Track A')
    expect(store.currentTrack?.id).toBe(1)
    expect(issues.value.map(issue => issue.id)).toEqual([2])
    expect(allIssues.value.map(issue => issue.id)).toEqual([1, 2])
    expect(mentionCandidates.value).toEqual({ general: [], mastering: [], issue_public: [], issue_internal: [] })
    expect(reviewAssignments.value).toEqual([{ id: 9 }])
    expect(loading.value).toBe(false)
    expect(loadError.value).toBe('')
  })

  it('tolerates assignment lookup failure with an empty list', async () => {
    mocks.getMock.mockResolvedValue(makeDetail())
    mocks.listAssignmentsMock.mockRejectedValue(new Error('forbidden'))

    const { track, reviewAssignments, loadError, load } = useTrackDetail(ref(1))
    await load()

    expect(track.value?.title).toBe('Track A')
    expect(reviewAssignments.value).toEqual([])
    expect(loadError.value).toBe('')
  })

  it('ignores a stale load that resolves after a newer one', async () => {
    let resolveStale!: (value: any) => void
    mocks.getMock
      .mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))
      .mockResolvedValueOnce(makeDetail({ track: { id: 1, title: 'fresh', workflow_cycle: 2 } }))

    const { track, loading, load } = useTrackDetail(ref(1))
    const stale = load()
    const fresh = load()
    await fresh

    resolveStale(makeDetail({ track: { id: 1, title: 'stale', workflow_cycle: 1 } }))
    await stale

    expect(track.value?.title).toBe('fresh')
    expect(loading.value).toBe(false)
  })

  it('drops an in-flight load when the track id changes mid-flight', async () => {
    const trackId = ref(1)
    let resolveFirst!: (value: any) => void
    mocks.getMock
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce(makeDetail({ track: { id: 2, title: 'Track B', workflow_cycle: 2 } }))

    const { track, load } = useTrackDetail(trackId)
    const first = load()
    trackId.value = 2
    await flushPromises()

    resolveFirst(makeDetail({ track: { id: 1, title: 'Track A', workflow_cycle: 2 } }))
    await first
    await flushPromises()

    expect(track.value?.id).toBe(2)
  })

  it('resets state and reloads when the track id changes', async () => {
    mocks.getMock.mockResolvedValue(makeDetail())
    mocks.listAssignmentsMock.mockResolvedValue([{ id: 9 }])

    const trackId = ref(1)
    const onTrackIdChange = vi.fn()
    const { issues, reviewAssignments, load } = useTrackDetail(trackId, { onTrackIdChange })
    await load()
    expect(issues.value.map(issue => issue.id)).toEqual([2])
    expect(reviewAssignments.value).toEqual([{ id: 9 }])

    trackId.value = 2
    await flushPromises()

    expect(onTrackIdChange).toHaveBeenCalledTimes(1)
    expect(mocks.getMock).toHaveBeenLastCalledWith(2)
  })

  it('sets loadError and clears the store track on failure', async () => {
    const store = useTrackStore()
    store.setCurrentTrack({ id: 1 } as any)
    mocks.getMock.mockRejectedValue(new Error('boom'))

    const { track, loadError, loading, load } = useTrackDetail(ref(1))
    await load()

    expect(loadError.value).toBe('boom')
    expect(loading.value).toBe(false)
    expect(track.value).toBeNull()
    expect(store.currentTrack).toBeNull()
  })

  it('keeps the previous track on reload failure unless clearTrackOnError is set', async () => {
    mocks.getMock.mockResolvedValueOnce(makeDetail())

    const keep = useTrackDetail(ref(1))
    await keep.load()
    expect(keep.track.value?.title).toBe('Track A')

    mocks.getMock.mockRejectedValueOnce(new Error('boom'))
    await keep.load()
    expect(keep.track.value?.title).toBe('Track A')
    expect(keep.loadError.value).toBe('boom')

    mocks.getMock.mockResolvedValueOnce(makeDetail())
    const clear = useTrackDetail(ref(1), { clearTrackOnError: true })
    await clear.load()
    expect(clear.track.value?.title).toBe('Track A')

    mocks.getMock.mockRejectedValueOnce(new Error('boom'))
    await clear.load()
    expect(clear.track.value).toBeNull()
    expect(clear.loadError.value).toBe('boom')
  })

  it('supports a custom error message mapper', async () => {
    mocks.getMock.mockRejectedValue({})

    const { loadError, load } = useTrackDetail(ref(1), { errorMessage: () => 'custom failure' })
    await load()

    expect(loadError.value).toBe('custom failure')
  })
})

describe('fetchTrackDetailBundle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.getMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
  })

  it('returns detail and assignments together', async () => {
    mocks.getMock.mockResolvedValue(makeDetail())
    mocks.listAssignmentsMock.mockResolvedValue([{ id: 3 }])

    const bundle = await fetchTrackDetailBundle(5)

    expect(mocks.getMock).toHaveBeenCalledWith(5)
    expect(bundle.detail.track.title).toBe('Track A')
    expect(bundle.assignments).toEqual([{ id: 3 }])
  })

  it('falls back to empty assignments when the assignment request fails', async () => {
    mocks.getMock.mockResolvedValue(makeDetail())
    mocks.listAssignmentsMock.mockRejectedValue(new Error('forbidden'))

    const bundle = await fetchTrackDetailBundle(5)

    expect(bundle.assignments).toEqual([])
  })
})
