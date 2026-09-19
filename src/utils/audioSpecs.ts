import type { AudioAnalysisResult, AudioSpec, AudioSpecCheck } from '@/types'
import { inspectWavFile, readAudioHeader } from '@/utils/wavPreflight'

export function evaluateAudioSpec(actual: Partial<AudioAnalysisResult> | null, spec?: AudioSpec | null): AudioSpecCheck {
  if (!spec?.enabled) return { status: 'disabled', differences: [] }
  if (!actual) return { status: 'unknown', differences: [] }
  const differences: AudioSpecCheck['differences'] = []
  let unknown = false
  for (const [field, allowed] of [
    ['container', spec.allowed_containers],
    ['sample_rate_hz', spec.allowed_sample_rates_hz],
    ['sample_format', spec.allowed_sample_formats],
  ] as const) {
    const value = actual[field]
    if (value == null) unknown = true
    else if (!(allowed as ReadonlyArray<string | number>).includes(value)) differences.push({ field, actual: value, allowed: [...allowed] })
  }
  return { status: differences.length ? 'mismatch' : unknown ? 'unknown' : 'match', differences }
}

export async function inspectAudioSpec(file: File, spec?: AudioSpec | null): Promise<AudioSpecCheck> {
  if (!spec?.enabled) return { status: 'disabled', differences: [] }
  try {
    return evaluateAudioSpec(await inspectWavFile(file), spec)
  } catch {
    // An unreadable/unsupported header is unverified. Do not guess from a filename
    // or browser decoding, which can resample and always exposes float samples.
    try {
      const bytes = new Uint8Array(await readAudioHeader(file, 16))
      const signature = String.fromCharCode(...bytes)
      const container = signature.startsWith('fLaC') ? 'flac'
        : signature.startsWith('OggS') ? 'ogg'
          : signature.startsWith('ID3') ? 'mp3'
            : signature.startsWith('FORM') && ['AIFF', 'AIFC'].includes(signature.slice(8, 12)) ? 'aiff'
              : signature.slice(4, 8) === 'ftyp' ? 'mp4' : null
      if (container) return evaluateAudioSpec({ container }, spec)
    } catch { /* Keep an unreadable file unverified. */ }
    return { status: 'unknown', differences: [] }
  }
}
