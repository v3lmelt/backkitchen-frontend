import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const addRegionMock = vi.fn()
const clearRegionsMock = vi.fn()
const enableDragSelectionMock = vi.fn()
const regionsOnMock = vi.fn()
const createMediaElementSourceMock = vi.fn()
const createGainMock = vi.fn()

type FakeGainNode = {
  gain: {
    value: number
    setTargetAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

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
  getMediaElement: ReturnType<typeof vi.fn>
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

vi.mock('@/utils/audioCache', () => ({
  loadAudioCached: (url: string) => {
    const token = localStorage.getItem('backkitchen_token')
    if (!token) return Promise.resolve(url)
    const sep = url.includes('?') ? '&' : '?'
    return Promise.resolve(`${url}${sep}token=${token}`)
  },
}))

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => {
      const handlers: HandlerMap = {}
      const mediaElement = document.createElement('audio')
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
        getMediaElement: vi.fn(() => mediaElement),
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
        getMediaElement: instance.getMediaElement,
        getDuration: instance.getDuration,
        getCurrentTime: instance.getCurrentTime,
        isPlaying: instance.isPlaying,
      }
    },
  },
}))

import WaveformPlayer from './WaveformPlayer.vue'

async function flushWaveformMount() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('WaveformPlayer', () => {
  beforeEach(() => {
    waveSurferInstances.length = 0
    addRegionMock.mockReset()
    clearRegionsMock.mockReset()
    enableDragSelectionMock.mockReset()
    regionsOnMock.mockReset()
    createMediaElementSourceMock.mockReset()
    createGainMock.mockReset()
    localStorage.clear()

    vi.stubGlobal('AudioContext', vi.fn(() => ({
      state: 'running',
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaElementSource: createMediaElementSourceMock.mockImplementation(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createGain: createGainMock.mockImplementation((): FakeGainNode => ({
        gain: {
          value: 1,
          setTargetAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      destination: {},
    })))
    Object.defineProperty(window, 'AudioContext', {
      value: globalThis.AudioContext,
      configurable: true,
      writable: true,
    })
  })

  it('loads cached audio URL and enables drag selection', async () => {
    localStorage.setItem('backkitchen_token', 'token-1')
    mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        selectable: true,
        mode: 'annotate',
        issues: [{ id: 1, severity: 'major', markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 3, time_end: null }] }],
      },
    })

    await flushWaveformMount()

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
          { id: 1, severity: 'major', markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 3.4, time_end: null }] },
          { id: 2, severity: 'critical', markers: [{ id: 2, issue_id: 2, marker_type: 'range', time_start: 8.2, time_end: 9.1 }] },
        ],
      },
    })

    await flushWaveformMount()
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

    await flushWaveformMount()

    waveSurferInstances[0].isPlaying.mockReturnValue(true)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(24)

    await wrapper.setProps({ compareVersionId: 2 })
    await flushWaveformMount()

    expect(waveSurferInstances).toHaveLength(2)
    expect(wrapper.text()).toContain('Loading B 0%')

    waveSurferInstances[0].setVolume.mockClear()
    waveSurferInstances[1].setVolume.mockClear()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(1)
    expect(waveSurferInstances[1].setVolume).not.toHaveBeenCalledWith(1)

    waveSurferInstances[1].handlers.ready?.()

    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(0)
    expect(waveSurferInstances[1].setVolume).toHaveBeenLastCalledWith(1)
    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(24 / 95)
    expect(waveSurferInstances[1].play.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps compare track aligned when switching to B mode', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await flushWaveformMount()

    await wrapper.setProps({ compareVersionId: 2 })
    await flushWaveformMount()

    waveSurferInstances[0].getCurrentTime.mockReturnValue(30)
    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(30 / 120)
  })

  it('maps waveform clicks to compare timeline when B mode is active', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await flushWaveformMount()

    waveSurferInstances[0].handlers.ready?.()
    waveSurferInstances[0].getDuration.mockReturnValue(95)
    await wrapper.setProps({ compareVersionId: 2 })
    await flushWaveformMount()

    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    waveSurferInstances[0].seekTo.mockClear()
    waveSurferInstances[1].seekTo.mockClear()

    waveSurferInstances[0].handlers.interaction?.(47.5)

    expect(waveSurferInstances[0].seekTo).toHaveBeenCalledWith(60 / 95)
    expect(waveSurferInstances[1].seekTo).toHaveBeenCalledWith(60 / 120)
  })

  it('applies true gain to both audio graphs', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
        showGainControl: true,
        gainDb: 6,
      },
    })

    await flushWaveformMount()

    expect(createGainMock).toHaveBeenCalledTimes(2)
    const [primaryUserGain] = createGainMock.mock.results.map(result => result.value as FakeGainNode)
    expect(primaryUserGain.gain.setTargetAtTime).toHaveBeenCalledWith(10 ** (6 / 20), 0, 0.01)

    await wrapper.setProps({ compareVersionId: 2 })
    await flushWaveformMount()

    expect(createGainMock).toHaveBeenCalledTimes(4)
    const compareUserGain = createGainMock.mock.results[2].value as FakeGainNode
    expect(compareUserGain.gain.setTargetAtTime).toHaveBeenCalledWith(10 ** (6 / 20), 0, 0.01)
  })

  it('emits gain updates from the slider and reset button', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        showGainControl: true,
        gainDb: 0,
      },
    })

    await flushWaveformMount()

    const slider = wrapper.find('input[type="range"]')
    await slider.setValue('4.5')
    expect(wrapper.emitted('update:gainDb')?.at(-1)).toEqual([4.5])

    await wrapper.findAll('button').find(button => button.text() === 'Reset')!.trigger('click')
    expect(wrapper.emitted('update:gainDb')?.at(-1)).toEqual([0])
  })

  it('shows active gain notice reset-to-zero shortcut and emits reset', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        showGainControl: true,
        gainDb: 3,
      },
    })

    await flushWaveformMount()

    const quickReset = wrapper.findAll('button').find(button => button.text() === 'Reset to 0 dB')
    expect(quickReset).toBeTruthy()

    await quickReset!.trigger('click')
    expect(wrapper.emitted('update:gainDb')?.at(-1)).toEqual([0])
  })

})
