import type { PremasterSampleFormat, PremasterSpec } from '@/types'

const HEADER_READ_LIMIT = 1024 * 1024

export interface WavFileInfo {
  container: 'wav'
  riff_variant: 'RIFF' | 'RF64' | 'BW64'
  codec: 'pcm' | 'ieee_float'
  sample_format: PremasterSampleFormat
  bit_depth: number
  sample_rate_hz: number
  channels: number
  channel_mask: number | null
}

export interface PremasterDifference {
  field: 'container' | 'sample_rate_hz' | 'sample_format'
  actual: string | number | null
  allowed: Array<string | number>
}

export interface PremasterPreflightResult {
  info: WavFileInfo
  differences: PremasterDifference[]
  matches: boolean
}

function ascii(view: DataView, offset: number, length: number): string {
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index))
  }
  return value
}

function ensureAvailable(view: DataView, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error('wav_truncated')
  }
}

function sampleFormat(formatTag: number, bitsPerSample: number): { codec: WavFileInfo['codec']; sample_format: PremasterSampleFormat } {
  if (formatTag === 1) {
    if (bitsPerSample === 16) return { codec: 'pcm', sample_format: 'pcm_s16' }
    if (bitsPerSample === 24) return { codec: 'pcm', sample_format: 'pcm_s24' }
    if (bitsPerSample === 32) return { codec: 'pcm', sample_format: 'pcm_s32' }
  }
  if (formatTag === 3 && bitsPerSample === 32) {
    return { codec: 'ieee_float', sample_format: 'pcm_f32' }
  }
  throw new Error('wav_sample_format_unsupported')
}

export function parseWavHeader(buffer: ArrayBuffer): WavFileInfo {
  const view = new DataView(buffer)
  ensureAvailable(view, 0, 12)
  const variant = ascii(view, 0, 4)
  if (!['RIFF', 'RF64', 'BW64'].includes(variant) || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('wav_signature_invalid')
  }

  let offset = 12
  let formatInfo: WavFileInfo | null = null
  while (offset + 8 <= view.byteLength) {
    const chunkId = ascii(view, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const dataOffset = offset + 8
    if (chunkId === 'fmt ') {
      ensureAvailable(view, dataOffset, Math.min(chunkSize, 40))
      if (chunkSize < 16) throw new Error('wav_fmt_invalid')
      let formatTag = view.getUint16(dataOffset, true)
      const channels = view.getUint16(dataOffset + 2, true)
      const rate = view.getUint32(dataOffset + 4, true)
      let bits = view.getUint16(dataOffset + 14, true)
      let channelMask: number | null = null

      if (formatTag === 0xfffe) {
        if (chunkSize < 40) throw new Error('wav_extensible_invalid')
        const extensionSize = view.getUint16(dataOffset + 16, true)
        if (extensionSize < 22) throw new Error('wav_extensible_invalid')
        const validBits = view.getUint16(dataOffset + 18, true)
        channelMask = view.getUint32(dataOffset + 20, true)
        formatTag = view.getUint16(dataOffset + 24, true)
        const guidTail = [
          view.getUint16(dataOffset + 26, true),
          view.getUint16(dataOffset + 28, true),
          view.getUint16(dataOffset + 30, true),
          view.getUint32(dataOffset + 32, true),
          view.getUint32(dataOffset + 36, true),
        ]
        if (guidTail.some((value, index) => value !== [0, 0, 0x0010, 0xaa000080, 0x719b3800][index])) {
          throw new Error('wav_sample_format_unsupported')
        }
        if (validBits > 0) bits = validBits
      }

      if (channels < 1 || rate < 1) throw new Error('wav_fmt_invalid')
      const normalized = sampleFormat(formatTag, bits)
      formatInfo = {
        container: 'wav',
        riff_variant: variant as WavFileInfo['riff_variant'],
        codec: normalized.codec,
        sample_format: normalized.sample_format,
        bit_depth: bits,
        sample_rate_hz: rate,
        channels,
        channel_mask: channelMask,
      }
    }

    if (chunkId === 'data') {
      if (!formatInfo) throw new Error('wav_fmt_not_found')
      return formatInfo
    }

    if (chunkSize === 0xffffffff && chunkId !== 'data') {
      throw new Error('wav_fmt_not_found')
    }
    const paddedSize = chunkSize + (chunkSize % 2)
    offset = dataOffset + paddedSize
  }
  throw new Error('wav_fmt_not_found')
}

export async function readAudioHeader(file: File, limit = HEADER_READ_LIMIT): Promise<ArrayBuffer> {
  const blob = file.slice(0, limit)
  return typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error ?? new Error('wav_truncated'))
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(blob)
      })
}

export async function inspectWavFile(file: File): Promise<WavFileInfo> {
  return parseWavHeader(await readAudioHeader(file))
}

export async function preflightPremaster(file: File, spec: PremasterSpec): Promise<PremasterPreflightResult> {
  const info = await inspectWavFile(file)
  const differences: PremasterDifference[] = []
  if (spec.enabled && !spec.allowed_sample_rates_hz.includes(info.sample_rate_hz)) {
    differences.push({ field: 'sample_rate_hz', actual: info.sample_rate_hz, allowed: spec.allowed_sample_rates_hz })
  }
  if (spec.enabled && !spec.allowed_sample_formats.includes(info.sample_format)) {
    differences.push({ field: 'sample_format', actual: info.sample_format, allowed: spec.allowed_sample_formats })
  }
  return { info, differences, matches: differences.length === 0 }
}
