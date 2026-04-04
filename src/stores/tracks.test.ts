import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  listMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  trackApi: { list: mocks.listMock, get: mocks.getMock },
}))

import { useTrackStore } from './tracks'

describe('tracks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.listMock.mockReset()
    mocks.getMock.mockReset()
  })

  it('loadTracks fetches and stores track list', async () => {
    const fakeTracks = [{ id: 1, title: 'Track A' }, { id: 2, title: 'Track B' }]
    mocks.listMock.mockResolvedValue(fakeTracks)

    const store = useTrackStore()
    expect(store.tracks).toEqual([])

    await store.loadTracks({ album_id: 5 })

    expect(mocks.listMock).toHaveBeenCalledWith({ album_id: 5 })
    expect(store.tracks).toEqual(fakeTracks)
    expect(store.loading).toBe(false)
  })

  it('loadTracks sets loading during fetch', async () => {
    let resolve: (v: unknown[]) => void
    mocks.listMock.mockReturnValue(new Promise(r => { resolve = r }))

    const store = useTrackStore()
    const p = store.loadTracks()
    expect(store.loading).toBe(true)

    resolve!([])
    await p
    expect(store.loading).toBe(false)
  })

  it('loadTracks resets loading on error', async () => {
    mocks.listMock.mockRejectedValue(new Error('network'))

    const store = useTrackStore()
    await expect(store.loadTracks()).rejects.toThrow('network')
    expect(store.loading).toBe(false)
  })

  it('loadTrack fetches and sets currentTrack', async () => {
    const fakeTrack = { id: 3, title: 'Track C' }
    mocks.getMock.mockResolvedValue({ track: fakeTrack, issues: [], checklist_items: [], events: [] })

    const store = useTrackStore()
    await store.loadTrack(3)

    expect(mocks.getMock).toHaveBeenCalledWith(3)
    expect(store.currentTrack).toEqual(fakeTrack)
    expect(store.loading).toBe(false)
  })

  it('loadTrack resets loading on error', async () => {
    mocks.getMock.mockRejectedValue(new Error('not found'))

    const store = useTrackStore()
    await expect(store.loadTrack(999)).rejects.toThrow('not found')
    expect(store.loading).toBe(false)
  })
})
