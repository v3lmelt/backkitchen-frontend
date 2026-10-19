import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { historyIssue } from '@/tests/issueHistoryFixtures'

import { mountWithPlugins } from '@/tests/utils'

const addRegionMock = vi.fn()
const clearRegionsMock = vi.fn()
const enableDragSelectionMock = vi.fn()
const regionsOnMock = vi.fn()
const createMediaElementSourceMock = vi.fn()
const createGainMock = vi.fn()
const loadAudioBlobCachedMock = vi.hoisted(() => vi.fn())

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
  loadBlob: ReturnType<typeof vi.fn>
  playPause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  seekTo: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  setVolume: ReturnType<typeof vi.fn>
  setOptions: ReturnType<typeof vi.fn>
  zoom: ReturnType<typeof vi.fn>
  getWidth: ReturnType<typeof vi.fn>
  getScroll: ReturnType<typeof vi.fn>
  setScroll: ReturnType<typeof vi.fn>
  setScrollTime: ReturnType<typeof vi.fn>
  getMediaElement: ReturnType<typeof vi.fn>
  getDuration: ReturnType<typeof vi.fn>
  getCurrentTime: ReturnType<typeof vi.fn>
  isPlaying: ReturnType<typeof vi.fn>
}

interface WaveformPlaybackControls {
  play: () => Promise<void>
  togglePlay: () => Promise<void>
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
  loadAudioBlobCached: loadAudioBlobCachedMock,
}))

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => {
      const handlers: HandlerMap = {}
      const mediaElement = document.createElement('audio')
      const instance: WaveSurferInstance = {
        handlers,
        load: vi.fn(),
        loadBlob: vi.fn(),
        playPause: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        seekTo: vi.fn(),
        destroy: vi.fn(),
        setVolume: vi.fn(),
        setOptions: vi.fn(),
        zoom: vi.fn(),
        getWidth: vi.fn(() => 800),
        getScroll: vi.fn(() => 0),
        setScroll: vi.fn(),
        setScrollTime: vi.fn(),
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
        loadBlob: instance.loadBlob,
        playPause: instance.playPause,
        play: instance.play,
        pause: instance.pause,
        seekTo: instance.seekTo,
        destroy: instance.destroy,
        setVolume: instance.setVolume,
        setOptions: instance.setOptions,
        zoom: instance.zoom,
        getWidth: instance.getWidth,
        getScroll: instance.getScroll,
        setScroll: instance.setScroll,
        setScrollTime: instance.setScrollTime,
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
  await flushPromises()
  await flushPromises()
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
    loadAudioBlobCachedMock.mockReset()
    loadAudioBlobCachedMock.mockImplementation(async (url: string) => {
      return new Blob([url], { type: 'audio/mpeg' })
    })
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

  it('loads cached audio blobs with loadBlob and enables drag selection', async () => {
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

    expect(loadAudioBlobCachedMock).toHaveBeenCalledWith(
      '/api/tracks/1/audio',
      expect.any(Function),
    )
    expect(waveSurferInstances[0].loadBlob).toHaveBeenCalledWith(expect.any(Blob))
    expect(waveSurferInstances[0].load).not.toHaveBeenCalled()
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

  it('emits playback state changes when the primary waveform plays or pauses', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()

    waveSurferInstances[0].handlers.play?.()
    waveSurferInstances[0].handlers.pause?.()

    expect(wrapper.emitted('playbackStateChange')).toEqual([[true], [false]])
  })

  it('keeps A active while B loads and only switches once B is ready', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()

    waveSurferInstances[0].isPlaying.mockReturnValue(true)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(24)

    await wrapper.setProps({ compareAudioUrl: '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2' })
    await flushWaveformMount()

    expect(waveSurferInstances).toHaveLength(2)
    expect(loadAudioBlobCachedMock).toHaveBeenCalledWith(
      '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2',
      expect.any(Function),
    )
    expect(waveSurferInstances[1].loadBlob).toHaveBeenCalledWith(expect.any(Blob))
    expect(waveSurferInstances[1].load).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Loading B 0%')


    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

    expect(wrapper.findAll('button').find(button => button.text() === 'B')!.attributes('disabled')).toBeDefined()
    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(1)

    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()
    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(1)
    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')

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
    waveSurferInstances[0].handlers.ready?.()

    await wrapper.setProps({ compareAudioUrl: '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2' })
    await flushWaveformMount()

    waveSurferInstances[0].getCurrentTime.mockReturnValue(30)
    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    expect(wrapper.emitted('activeSideChange')?.at(-1)).toEqual(['B'])

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
    await wrapper.setProps({ compareAudioUrl: '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2' })
    await flushWaveformMount()

    waveSurferInstances[1].getDuration.mockReturnValue(120)
    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    expect(wrapper.emitted('activeSideChange')?.at(-1)).toEqual(['B'])

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

    await wrapper.setProps({ compareAudioUrl: '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2' })
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

  it('zooms review waveforms while keeping visible markers on the scrolled timeline', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        zoomable: true,
        issues: [{
          id: 7,
          title: 'Precise issue',
          severity: 'major',
          status: 'open',
          created_at: '2026-08-21T00:00:00Z',
          markers: [{ id: 9, issue_id: 7, marker_type: 'point', time_start: 30, time_end: null }],
        }],
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.vm.$nextTick()

    const zoomIn = wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')
    expect(zoomIn).toBeTruthy()
    await zoomIn!.trigger('click')

    expect(waveSurferInstances[0].zoom).toHaveBeenLastCalledWith(1600 / 95)
    expect(wrapper.text()).toContain('2×')

    waveSurferInstances[0].handlers.scroll?.(20, 40, 100, 900)
    await wrapper.vm.$nextTick()

    const markerButton = wrapper.get('button[aria-label="Precise issue"]')
    expect((markerButton.element.parentElement as HTMLElement).style.left).toBe('50%')
  })

  it('keeps draft point numbers stable when earlier markers leave the viewport', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        zoomable: true,
        draftMarkers: [
          { marker_type: 'point', time_start: 10, time_end: null },
          { marker_type: 'point', time_start: 80, time_end: null },
        ],
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')!.trigger('click')

    waveSurferInstances[0].handlers.scroll?.(70, 90, 100, 900)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.draft-point-index').map(marker => marker.text())).toEqual(['2'])
  })

  it('centers an existing issue without changing the current zoom level', async () => {
    const issue = {
      id: 8,
      title: 'Late issue',
      severity: 'major',
      status: 'open',
      created_at: '2026-08-21T00:00:00Z',
      markers: [{ id: 10, issue_id: 8, marker_type: 'point', time_start: 80, time_end: null }],
    }
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        zoomable: true,
        issues: [issue],
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')!.trigger('click')
    const zoomCalls = waveSurferInstances[0].zoom.mock.calls.length

    ;(wrapper.vm as unknown as { focusIssue: (value: unknown) => void }).focusIssue(issue)

    expect(waveSurferInstances[0].zoom).toHaveBeenCalledTimes(zoomCalls)
    expect(waveSurferInstances[0].setScrollTime).toHaveBeenLastCalledWith(47.5)
  })

  it('applies the active zoom and scroll position when a comparison waveform becomes ready', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, {
      props: {
        audioUrl: '/api/tracks/1/audio',
        trackId: 1,
        zoomable: true,
      },
    })

    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')!.trigger('click')
    waveSurferInstances[0].getScroll.mockReturnValue(240)

    await wrapper.setProps({ compareAudioUrl: '/api/tracks/1/source-versions/2/audio?v=2&c=1&t=fixture-2' })
    await flushWaveformMount()
    waveSurferInstances[1].handlers.ready?.()

    expect(waveSurferInstances[1].zoom).toHaveBeenLastCalledWith(1600 / 95)
    expect(waveSurferInstances[1].setScroll).toHaveBeenLastCalledWith(240)
  })

  it('uses only the actually audible side markers and its duration for geometry', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio', trackId: 9,
      issues: [historyIssue({ title: 'Current A' })],
      compareIssues: [historyIssue({ id: 2, title: 'Historical B', source_version_id: 11 })],
      zoomable: true,
    } })
    await flushWaveformMount()
    waveSurferInstances[0].getDuration.mockReturnValue(4)
    waveSurferInstances[0].getWidth.mockReturnValue(160)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(1)
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.setProps({ compareAudioUrl: '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=fixture-11' })
    await flushWaveformMount()
    expect(wrapper.find('button[aria-label="Current A"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Historical B"]').exists()).toBe(false)
    waveSurferInstances[1].getDuration.mockReturnValue(2)
    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button[aria-label="Current A"]').element.parentElement?.style.left).toBe('25%')
    expect(wrapper.find('button[aria-label="Historical B"]').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    expect(wrapper.find('button[aria-label="Current A"]').exists()).toBe(false)
    expect(wrapper.get('button[aria-label="Historical B"]').element.parentElement?.style.left).toBe('50%')
    expect(wrapper.emitted('activeSideChange')?.at(-1)).toEqual(['B'])
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')!.trigger('click')
    waveSurferInstances[1].handlers.scroll?.(0.5, 1.5, 200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('button[aria-label="Historical B"]').element.parentElement?.style.left).toBe('50%')
    await wrapper.findAll('button').find(button => button.text() === 'A')!.trigger('click')
    expect(wrapper.find('button[aria-label="Historical B"]').exists()).toBe(false)
    expect(wrapper.get('button[aria-label="Current A"]').element.parentElement?.style.left).toBe('25%')
    wrapper.unmount()
  })

  it('reports primary network and decode failures with the exact audio identity', async () => {
    const error = new Error('Audio fetch failed: 403')
    loadAudioBlobCachedMock.mockRejectedValueOnce(error)
    const wrapper = mountWithPlugins(WaveformPlayer, { props: { audioUrl: '/api/tracks/9/master-deliveries/21/audio' } })
    await flushWaveformMount()
    expect(wrapper.emitted('load-error')?.[0]).toEqual([{ audioUrl: '/api/tracks/9/master-deliveries/21/audio', side: 'A', error }])
    const pending = Promise.withResolvers<Blob>()
    loadAudioBlobCachedMock.mockReturnValueOnce(pending.promise)
    await wrapper.setProps({ audioUrl: '/api/tracks/9/source-versions/11/audio' })
    const decodeError = new Error('Decode failed')
    waveSurferInstances[1].loadBlob.mockRejectedValueOnce(decodeError)
    pending.resolve(new Blob(['bad audio']))
    await flushWaveformMount()
    expect(wrapper.emitted('load-error')?.at(-1)).toEqual([{ audioUrl: '/api/tracks/9/source-versions/11/audio', side: 'A', error: decodeError }])
    wrapper.unmount()
  })

  it('keeps A markers and playback available when the protected comparison fails', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio', trackId: 9,
      issues: [historyIssue({ title: 'Current A' })], compareIssues: [historyIssue({ id: 2, title: 'Historical B' })],
    } })
    await flushWaveformMount()
    waveSurferInstances[0].handlers.ready?.()
    loadAudioBlobCachedMock.mockRejectedValueOnce(new Error('Audio fetch failed: 404'))
    await wrapper.setProps({ compareAudioUrl: '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=fixture-11' })
    await flushWaveformMount()
    expect(wrapper.emitted('load-error')?.at(-1)?.[0]).toMatchObject({ audioUrl: '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=fixture-11', side: 'B' })
    expect(wrapper.find('button[aria-label="Current A"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Historical B"]').exists()).toBe(false)
    expect(wrapper.findAll('button').find(button => button.text() === 'B')!.attributes('disabled')).toBeDefined()
    expect(waveSurferInstances[0].setVolume).toHaveBeenLastCalledWith(1)
    wrapper.unmount()
  })

  it('does not stretch B click time when both zoomed tracks share pixels per second', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio', zoomable: true,
    } })
    await flushWaveformMount()
    waveSurferInstances[0].getDuration.mockReturnValue(4)
    waveSurferInstances[0].getWidth.mockReturnValue(160)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(1)
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.setProps({ compareAudioUrl: '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=fixture-11' })
    await flushWaveformMount()
    waveSurferInstances[1].getDuration.mockReturnValue(2)
    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    expect(wrapper.emitted('activeSideChange')?.at(-1)).toEqual(['B'])
    await wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Zoom in')!.trigger('click')
    waveSurferInstances[0].seekTo.mockClear()
    waveSurferInstances[1].seekTo.mockClear()
    waveSurferInstances[0].handlers.interaction?.(1)
    expect(waveSurferInstances[0].seekTo).toHaveBeenLastCalledWith(1 / 4)
    expect(waveSurferInstances[1].seekTo).toHaveBeenLastCalledWith(1 / 2)
    wrapper.unmount()
  })

  it('blocks stale ready, markers and playback while a different source blob is pending or still decoding', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio?v=3&c=2&t=original',
      issues: [historyIssue({ title: 'Before source switch' })],
    } })
    await flushWaveformMount()
    waveSurferInstances[0].getDuration.mockReturnValue(4)
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.vm.$nextTick()
    const readyCount = wrapper.emitted('ready')?.length
    const pending = Promise.withResolvers<Blob>()
    loadAudioBlobCachedMock.mockImplementationOnce((_url: string, progress: (value: number) => void) => {
      progress(100)
      return pending.promise
    })
    await wrapper.setProps({
      audioUrl: '/api/tracks/9/source-versions/12/audio?v=2&c=2&t=replacement',
      issues: [historyIssue({ id: 2, title: 'After source switch', source_version_id: 12 })],
    })
    expect(waveSurferInstances[0].destroy).toHaveBeenCalledTimes(1)
    waveSurferInstances[0].handlers.ready?.()
    waveSurferInstances[0].handlers.click?.()
    const controls = wrapper.vm as unknown as WaveformPlaybackControls
    await controls.play()
    await controls.togglePlay()
    expect(wrapper.emitted('ready')).toHaveLength(readyCount ?? 0)
    expect(wrapper.find('button[aria-label="Before source switch"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="After source switch"]').exists()).toBe(false)
    expect(waveSurferInstances[1].play).not.toHaveBeenCalled()
    expect(waveSurferInstances[1].playPause).not.toHaveBeenCalled()
    pending.resolve(new Blob(['replacement']))
    await flushWaveformMount()
    await controls.play()
    expect(waveSurferInstances[1].play).not.toHaveBeenCalled()
    waveSurferInstances[1].getDuration.mockReturnValue(2)
    waveSurferInstances[1].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await controls.play()
    expect(waveSurferInstances[1].play).toHaveBeenCalledTimes(1)
    expect(wrapper.find('button[aria-label="After source switch"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('isolates an uncancellable old decoder so a stale failure cannot disable the ready new source', async () => {
    const originalBlob = Promise.withResolvers<Blob>()
    loadAudioBlobCachedMock.mockReturnValueOnce(originalBlob.promise)
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio?v=3&c=2&t=original',
    } })
    await flushWaveformMount()
    const oldDecode = Promise.withResolvers<void>()
    waveSurferInstances[0].loadBlob.mockReturnValueOnce(oldDecode.promise)
    originalBlob.resolve(new Blob(['original']))
    await flushWaveformMount()
    await wrapper.setProps({ audioUrl: '/api/tracks/9/source-versions/12/audio?v=2&c=2&t=replacement' })
    await flushWaveformMount()
    expect(waveSurferInstances[0].destroy).toHaveBeenCalledTimes(1)
    expect(waveSurferInstances[1].loadBlob).toHaveBeenCalledTimes(1)
    waveSurferInstances[1].handlers.ready?.()
    const oldError = new Error('Old decode failed')
    waveSurferInstances[0].handlers.error?.(oldError)
    oldDecode.reject(oldError)
    await flushWaveformMount()
    expect(wrapper.emitted('load-error')).toBeUndefined()
    const controls = wrapper.vm as unknown as WaveformPlaybackControls
    await controls.play()
    expect(waveSurferInstances[1].play).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('reports pre-ready native metadata errors even when loadBlob never rejects and permits a later source', async () => {
    const originalBlob = Promise.withResolvers<Blob>()
    loadAudioBlobCachedMock.mockReturnValueOnce(originalBlob.promise)
    const originalUrl = '/api/tracks/9/source-versions/13/audio?v=3&c=2&t=original'
    const wrapper = mountWithPlugins(WaveformPlayer, { props: { audioUrl: originalUrl } })
    await flushWaveformMount()
    const metadataWait = Promise.withResolvers<void>()
    waveSurferInstances[0].loadBlob.mockReturnValueOnce(metadataWait.promise)
    originalBlob.resolve(new Blob(['bad metadata']))
    await flushWaveformMount()
    const error = new Error('Metadata unavailable')
    waveSurferInstances[0].handlers.error?.(error)
    expect(wrapper.emitted('load-error')?.[0]).toEqual([{ audioUrl: originalUrl, side: 'A', error }])
    expect(waveSurferInstances[0].destroy).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ audioUrl: '/api/tracks/9/source-versions/12/audio?v=2&c=2&t=replacement' })
    await flushWaveformMount()
    waveSurferInstances[1].handlers.ready?.()
    const controls = wrapper.vm as unknown as WaveformPlaybackControls
    await controls.play()
    expect(waveSurferInstances[1].play).toHaveBeenCalledTimes(1)
    metadataWait.resolve()
    await flushWaveformMount()
    expect(wrapper.emitted('load-error')).toHaveLength(1)
    wrapper.unmount()
  })

  it('ignores ready, error, progress and time events from replaced comparison instances', async () => {
    const wrapper = mountWithPlugins(WaveformPlayer, { props: {
      audioUrl: '/api/tracks/9/source-versions/13/audio', trackId: 9,
      issues: [historyIssue({ title: 'Current A' })],
      compareIssues: [historyIssue({ id: 2, title: 'Historical B', source_version_id: 11 })],
    } })
    await flushWaveformMount()
    waveSurferInstances[0].getDuration.mockReturnValue(4)
    waveSurferInstances[0].getCurrentTime.mockReturnValue(1)
    waveSurferInstances[0].handlers.ready?.()
    await wrapper.setProps({ compareAudioUrl: '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=older' })
    await flushWaveformMount()
    await wrapper.setProps({
      compareAudioUrl: '/api/tracks/9/source-versions/12/audio?v=2&c=2&t=newer',
      compareIssues: [historyIssue({ id: 3, title: 'New historical B', source_version_id: 12 })],
    })
    await flushWaveformMount()
    expect(waveSurferInstances[1].destroy).toHaveBeenCalledTimes(1)
    waveSurferInstances[1].handlers.loading?.(73)
    waveSurferInstances[1].handlers.ready?.()
    waveSurferInstances[1].handlers.error?.(new Error('Stale comparison error'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Loading B 0%')
    expect(wrapper.findAll('button').find(button => button.text() === 'B')!.attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('load-error')).toBeUndefined()
    waveSurferInstances[2].getDuration.mockReturnValue(2)
    waveSurferInstances[2].handlers.ready?.()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.text() === 'B')!.trigger('click')
    expect(wrapper.emitted('activeSideChange')?.at(-1)).toEqual(['B'])
    expect(wrapper.find('button[aria-label="Current A"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="New historical B"]').exists()).toBe(true)
    const previousUpdates = wrapper.emitted('timeupdate')?.length ?? 0
    waveSurferInstances[1].handlers.timeupdate?.(1.5)
    expect(wrapper.emitted('timeupdate')?.length ?? 0).toBe(previousUpdates)
    waveSurferInstances[2].handlers.timeupdate?.(0.75)
    expect(wrapper.emitted('timeupdate')?.at(-1)).toEqual([0.75])
    wrapper.unmount()
  })
})
