import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const addRegionMock = vi.fn()
const clearRegionsMock = vi.fn()
const enableDragSelectionMock = vi.fn()
const regionsOnMock = vi.fn()
const loadBlobMock = vi.fn()
const onMock = vi.fn()
const playPauseMock = vi.fn()
const seekToMock = vi.fn()
const destroyMock = vi.fn()
const getDurationMock = vi.fn(() => 95)
const getCurrentTimeMock = vi.fn(() => 12.3)
let waveSurferHandlers: Record<string, (...args: any[]) => void>
let regionHandlers: Record<string, (...args: any[]) => void>

vi.mock('wavesurfer.js/dist/plugins/regions.js', () => ({
  default: {
    create: () => ({
      addRegion: addRegionMock,
      clearRegions: clearRegionsMock,
      enableDragSelection: enableDragSelectionMock,
      on: (event: string, handler: (...args: any[]) => void) => {
        regionHandlers[event] = handler
        regionsOnMock(event, handler)
      },
      getRegions: () => [],
    }),
  },
}))

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => ({
      on: (event: string, handler: (...args: any[]) => void) => {
        waveSurferHandlers[event] = handler
        onMock(event, handler)
      },
      loadBlob: loadBlobMock,
      playPause: playPauseMock,
      seekTo: seekToMock,
      destroy: destroyMock,
      getDuration: getDurationMock,
      getCurrentTime: getCurrentTimeMock,
    }),
  },
}))

import WaveformPlayer from './WaveformPlayer.vue'

describe('WaveformPlayer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) }))
    waveSurferHandlers = {}
    regionHandlers = {}
    addRegionMock.mockReset()
    clearRegionsMock.mockReset()
    enableDragSelectionMock.mockReset()
    regionsOnMock.mockReset()
    loadBlobMock.mockReset()
    onMock.mockReset()
    destroyMock.mockReset()
    localStorage.clear()
  })

  it('loads audio with bearer auth and enables drag selection', async () => {
    localStorage.setItem('backkitchen_token', 'token-1')
    mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        selectable: true,
        issues: [{ id: 1, issue_type: 'point', severity: 'major', time_start: 3, time_end: null }],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledWith('/api/tracks/1/audio', {
      headers: { Authorization: 'Bearer token-1' },
    })
    expect(loadBlobMock).toHaveBeenCalledTimes(1)
    expect(enableDragSelectionMock).toHaveBeenCalledTimes(1)
  })

  it('clears regions on ready and destroys wavesurfer on unmount', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        issues: [
          { id: 1, issue_type: 'point', severity: 'major', time_start: 3.4, time_end: null },
          { id: 2, issue_type: 'range', severity: 'critical', time_start: 8.2, time_end: 9.1 },
        ],
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    waveSurferHandlers.ready?.()

    expect(clearRegionsMock).toHaveBeenCalled()

    await Promise.resolve()
    wrapper.unmount()
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })
})
