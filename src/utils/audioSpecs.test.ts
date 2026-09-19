import { describe, expect, it } from 'vitest'
import { evaluateAudioSpec, inspectAudioSpec } from './audioSpecs'
import type { AudioSpec } from '@/types'

const spec: AudioSpec = { enabled: true, allowed_containers: ['wav'], allowed_sample_rates_hz: [48000], allowed_sample_formats: ['pcm_s24'] }
describe('advisory format checks', () => {
  it('ignores loudness and peaks', () => {
    expect(evaluateAudioSpec({ container: 'wav', sample_rate_hz: 48000, sample_format: 'pcm_s24', true_peak_dbtp: 3, integrated_lufs: -4 }, spec).status).toBe('match')
  })
  it('uses header signatures rather than misleading filenames', async () => {
    const check = await inspectAudioSpec(new File(['fLaC000000000000'], 'mix.wav'), spec)
    expect(check.status).toBe('mismatch')
    expect(check.differences).toEqual([{ field: 'container', actual: 'flac', allowed: ['wav'] }])
    expect((await inspectAudioSpec(new File(['broken'], 'mix.mp3'), spec)).status).toBe('unknown')
  })
  it('does not infer a match from missing metadata or inspect disabled specs', async () => {
    expect(evaluateAudioSpec({ container: 'wav' }, spec).status).toBe('unknown')
    expect((await inspectAudioSpec(new File(['broken'], 'mix.wav'), { ...spec, enabled: false })).status).toBe('disabled')
  })
})
