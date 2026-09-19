import { describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'
import type { AudioAnalysis } from '@/types'
import AudioTechnicalDataCard from './AudioTechnicalDataCard.vue'

function readyAnalysis(overrides: Partial<NonNullable<AudioAnalysis['result']>> = {}): AudioAnalysis {
  return {
    status: 'ready',
    error: null,
    attempts: 1,
    analyzed_at: '2026-09-04T00:00:00Z',
    result: {
      analyzer_version: 1,
      container: 'wav',
      codec: 'pcm_s24le',
      sample_format: 'pcm_s24',
      bit_depth: 24,
      sample_rate_hz: 48000,
      channels: 2,
      channel_layout: 'stereo',
      duration_seconds: 90,
      bitrate_bps: 2304000,
      sample_peak_dbfs: -1.2,
      sample_peak_dbfs_by_channel: [-1.2, -1.4],
      true_peak_dbtp: -1,
      true_peak_dbtp_by_channel: [-1, -1.1],
      dc_offset: 0.000001,
      dc_offset_by_channel: [0.000001, -0.000001],
      integrated_lufs: -14,
      loudness_range_lu: 4.2,
      ...overrides,
    },
  }
}

describe('AudioTechnicalDataCard', () => {
  it('hides decoder sample formats for compressed audio', () => {
    const wrapper = mountWithPlugins(AudioTechnicalDataCard, {
      props: {
        analysis: readyAnalysis({
          container: 'mp3',
          codec: 'mp3',
          sample_format: 'pcm_f32',
          bit_depth: null,
          bitrate_bps: 320000,
        }),
      },
    })

    expect(wrapper.text()).toContain('MP3 · 48 kHz')
    expect(wrapper.text()).not.toContain('pcm_f32')
    expect(wrapper.text()).not.toContain('32-bit float PCM')
    expect(wrapper.text()).not.toContain('Sample format')
  })

  it('keeps all headline analysis metrics in the handoff summary', () => {
    const wrapper = mountWithPlugins(AudioTechnicalDataCard, {
      props: { analysis: readyAnalysis(), summary: true },
    })

    expect(wrapper.text()).toContain('Digital Peak')
    expect(wrapper.text()).toContain('True Peak')
    expect(wrapper.text()).toContain('DC Offset')
    expect(wrapper.text()).toContain('Integrated')
    expect(wrapper.text()).toContain('LRA')
    expect(wrapper.text()).not.toContain('Codec')
    expect(wrapper.text()).not.toContain('CH 1')
  })

  it('shows complete PCM metadata and channel data when expanded by default', () => {
    const wrapper = mountWithPlugins(AudioTechnicalDataCard, {
      props: { analysis: readyAnalysis(), defaultChannelsExpanded: true },
    })

    expect(wrapper.text()).toContain('WAV · 24-bit integer PCM · 48 kHz')
    expect(wrapper.text()).toContain('Sample format')
    expect(wrapper.text()).toContain('CH 1')
    expect(wrapper.text()).toContain('CH 2')
  })
})
