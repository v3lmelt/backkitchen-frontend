import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const addRegionMock = vi.fn()
const clearRegionsMock = vi.fn()
const enableDragSelectionMock = vi.fn()
const regionsOnMock = vi.fn()

type HandlerMap = Record<string, (...args: any[]) => void>
type WaveSurferInstance = {
  handlers: HandlerMap
  load: ReturnType<typeof vi.fn>
  playPause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  seekTo: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  setVolume: ReturnType<typeof vi.fn>
  setOptions: ReturnType<typeof vi.fn>
  getDuration: ReturnType<typeof vi.fn>
  getCurrentTime: ReturnType<typeof vi.fn>
  isPlaying: ReturnType<typeof vi.fn>
}

const waveSurferInstances: WaveSurferInstance[] = []

vi.mock('wavesurfer.js/dist/plugins/regions.js', () => ({
  default: {
    create: () => ({
      addRegion: addRegionMock,
      clearRegions: clearRegionsMock,
      enableDragSelection: enableDragSelectionMock,
      on: (event: string, handler: (...args: any[]) => void) => {
        regionsOnMock(event, handler)
      },
      getRegions: () => [],
    }),
  },
}))

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => {
      const handlers: HandlerMap = {}
      const instance: WaveSurferInstance = {
        handlers,
        load: vi.fn(),
        playPause: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        seekTo: vi.fn(),
        destroy: vi.fn(),
        setVolume: vi.fn(),
        setOptions: vi.fn(),
        getDuration: vi.fn(() => 95),
        getCurrentTime: vi.fn(() => 12.3),
        isPlaying: vi.fn(() => false),
      }
      waveSurferInstances.push(instance)
      return {
        on: (event: string, handler: (...args: any[]) => void) => {
          handlers[event] = handler
        },
        load: instance.load,
        playPause: instance.playPause,
        play: instance.play,
        pause: instance.pause,
        seekTo: instance.seekTo,
        destroy: instance.destroy,
        setVolume: instance.setVolume,
        setOptions: instance.setOptions,
        getDuration: instance.getDuration,
        getCurrentTime: instance.getCurrentTime,
        isPlaying: instance.isPlaying,
      }
    },
  },
}))

import WaveformPlayer from './WaveformPlayer.vue'

describe('WaveformPlayer', () => {
  beforeEach(() => {
    waveSurferInstances.length = 0
    addRegionMock.mockReset()
    clearRegionsMock.mockReset()
    enableDragSelectionMock.mockReset()
    regionsOnMock.mockReset()
    localStorage.clear()
  })

  it('loads audio with token query param and enables drag selection', async () => {
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

    expect(waveSurferInstances[0].load).toHaveBeenCalledWith(
      '/api/tracks/1/audio?token=token-1',
    )
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
    waveSurferInstances[0].handlers.ready?.()

    expect(clearRegionsMock).toHaveBeenCalled()

    await Promise.resolve()
    wrapper.unmount()
    expect(waveSurferInstances[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('applies deferred B mode after compare track becomes ready', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    waveSurferInstances[0].isPlaying.mockReturnValue(true)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(24)

    await wrapper.setProps({ compareVersionId: 2 })
    await Promise.resolve()
    await Promise.resolve()

    expect(waveSurferInstances).toHaveLength(2)
    expect(wrapper.text()).toContain('Loading B 0%')

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(1)
    expect(waveSurferInstances[1].setVolume).not.toHaveBeenCalledWith(1)

    waveSurferInstances[1].handlers.ready?.()

    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(0)
    expect(waveSurferInstances[1].setVolume).toHaveBeenLastCalledWith(1)
    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(24 / 95)
    expect(waveSurferInstances[1].play.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps compare track at the same absolute time during B playback', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    await wrapper.setProps({ compareVersionId: 2 })
    await Promise.resolve()
    await Promise.resolve()

    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    waveSurferInstances[1].seekTo.mockClear()

    waveSurferInstances[0].handlers.timeupdate?.(30)

    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(30 / 120)
  })

  it('maps waveform clicks to compare timeline when B mode is active', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    waveSurferInstances[0].handlers.ready?.()
    waveSurferInstances[0].getDuration.mockReturnValue(95)
    await wrapper.setProps({ compareVersionId: 2 })
    await Promise.resolve()
    await Promise.resolve()

    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    waveSurferInstances[0].seekTo.mockClear()
    waveSurferInstances[1].seekTo.mockClear()

    waveSurferInstances[0].handlers.interaction?.(47.5)

    expect(waveSurferInstances[0].seekTo).toHaveBeenCalledWith(60 / 95)
    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(60 / 120)
  })

})
