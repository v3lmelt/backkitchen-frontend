import { describe, expect, it } from 'vitest'
import { parseWavHeader, preflightPremaster } from './wavPreflight'

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function wavHeader(options: {
  variant?: 'RIFF' | 'RF64' | 'BW64'
  tag?: number
  bits?: number
  validBits?: number
  rate?: number
  channels?: number
  extensibleSubTag?: number
} = {}): ArrayBuffer {
  const extensible = options.tag === 0xfffe
  const fmtSize = extensible ? 40 : 16
  const offset = options.variant === 'RF64' || options.variant === 'BW64' ? 48 : 12
  const dataChunkOffset = offset + 8 + fmtSize
  const buffer = new ArrayBuffer(dataChunkOffset + 8)
  const view = new DataView(buffer)
  writeAscii(view, 0, options.variant ?? 'RIFF')
  view.setUint32(4, 0xffffffff, true)
  writeAscii(view, 8, 'WAVE')
  if (offset === 48) {
    writeAscii(view, 12, 'ds64')
    view.setUint32(16, 28, true)
  }
  writeAscii(view, offset, 'fmt ')
  view.setUint32(offset + 4, fmtSize, true)
  const data = offset + 8
  view.setUint16(data, options.tag ?? 1, true)
  view.setUint16(data + 2, options.channels ?? 2, true)
  view.setUint32(data + 4, options.rate ?? 48000, true)
  view.setUint16(data + 12, (options.channels ?? 2) * ((options.bits ?? 24) / 8), true)
  view.setUint16(data + 14, options.bits ?? 24, true)
  if (extensible) {
    view.setUint16(data + 16, 22, true)
    view.setUint16(data + 18, options.validBits ?? options.bits ?? 32, true)
    view.setUint32(data + 20, 3, true)
    view.setUint16(data + 24, options.extensibleSubTag ?? 3, true)
    view.setUint16(data + 26, 0, true)
    view.setUint16(data + 28, 0, true)
    view.setUint16(data + 30, 0x0010, true)
    view.setUint32(data + 32, 0xaa000080, true)
    view.setUint32(data + 36, 0x719b3800, true)
  }
  writeAscii(view, dataChunkOffset, 'data')
  view.setUint32(dataChunkOffset + 4, options.variant === 'RIFF' || options.variant == null ? 0 : 0xffffffff, true)
  return buffer
}

describe('parseWavHeader', () => {
  it('reads integer PCM from RIFF without decoding audio', () => {
    expect(parseWavHeader(wavHeader())).toMatchObject({
      riff_variant: 'RIFF',
      sample_format: 'pcm_s24',
      bit_depth: 24,
      sample_rate_hz: 48000,
      channels: 2,
    })
  })

  it('supports RF64 and BW64 headers', () => {
    expect(parseWavHeader(wavHeader({ variant: 'RF64', bits: 16 })).riff_variant).toBe('RF64')
    expect(parseWavHeader(wavHeader({ variant: 'BW64', bits: 32 })).riff_variant).toBe('BW64')
  })

  it('supports WAVE_FORMAT_EXTENSIBLE float PCM', () => {
    expect(parseWavHeader(wavHeader({ tag: 0xfffe, bits: 32, extensibleSubTag: 3 }))).toMatchObject({
      codec: 'ieee_float',
      sample_format: 'pcm_f32',
      channel_mask: 3,
    })
  })

  it('rejects damaged and disguised files', () => {
    expect(() => parseWavHeader(new TextEncoder().encode('not a wav file').buffer)).toThrow('wav_signature_invalid')
    expect(() => parseWavHeader(wavHeader().slice(0, 36))).toThrow('wav_fmt_not_found')
  })
})

describe('preflightPremaster', () => {
  it('returns machine-readable differences for an enabled specification', async () => {
    const file = new File([wavHeader({ rate: 44100, bits: 16 })], 'premaster.wav', { type: 'audio/wav' })
    const result = await preflightPremaster(file, {
      enabled: true,
      allowed_containers: ['wav'],
      allowed_sample_rates_hz: [48000],
      allowed_sample_formats: ['pcm_s24'],
    })
    expect(result.matches).toBe(false)
    expect(result.differences.map(item => item.field)).toEqual(['sample_rate_hz', 'sample_format'])
  })

  it('still validates the WAV header when additional restrictions are disabled', async () => {
    const file = new File([wavHeader({ rate: 44100, bits: 16 })], 'premaster.wav', { type: 'audio/wav' })
    const result = await preflightPremaster(file, {
      enabled: false,
      allowed_containers: ['wav'],
      allowed_sample_rates_hz: [],
      allowed_sample_formats: [],
    })
    expect(result.matches).toBe(true)
    expect(result.info).toMatchObject({ sample_rate_hz: 44100, sample_format: 'pcm_s16' })
  })
})
