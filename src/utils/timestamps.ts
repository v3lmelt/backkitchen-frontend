export type TimestampTarget = 'track' | 'attachment'

export interface TimeReference {
  raw: string
  prefixTarget: TimestampTarget | null
  startSeconds: number
  endSeconds: number | null
  isRange: boolean
  index: number
  length: number
}

export type TimeReferenceSegment =
  | { type: 'text'; value: string }
  | { type: 'reference'; value: TimeReference }

const TIME_VALUE = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\.\\d{1,3})?'
const TIME_REFERENCE_PATTERN = new RegExp(
  String.raw`(?<![\w])(?:(?<prefix>[at]):)?(?<start>${TIME_VALUE})(?:\s*-\s*(?<end>${TIME_VALUE}))?(?![\w])`,
  'gi',
)

export function parseTimecode(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const [main, fractional = ''] = trimmed.split('.')
  const parts = main.split(':').map(part => Number(part))
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return null
  if (parts.length < 2 || parts.length > 3) return null

  const seconds = parts.pop() ?? 0
  const minutes = parts.pop() ?? 0
  const hours = parts.pop() ?? 0
  if (seconds >= 60 || minutes >= 60) return null

  const milliseconds = fractional ? Number(`0.${fractional.padEnd(3, '0').slice(0, 3)}`) : 0
  if (!Number.isFinite(milliseconds)) return null

  return hours * 3600 + minutes * 60 + seconds + milliseconds
}

export function extractTimeReferences(text: string): TimeReference[] {
  const matches = text.matchAll(new RegExp(TIME_REFERENCE_PATTERN))
  const references: TimeReference[] = []

  for (const match of matches) {
    const startValue = match.groups?.start
    if (!startValue || match.index == null) continue

    const startSeconds = parseTimecode(startValue)
    if (startSeconds == null) continue

    const endValue = match.groups?.end
    const endSeconds = endValue ? parseTimecode(endValue) : null
    if (endValue && (endSeconds == null || endSeconds <= startSeconds)) continue

    const prefix = match.groups?.prefix?.toLowerCase()
    const prefixTarget = prefix === 'a' ? 'attachment' : prefix === 't' ? 'track' : null

    references.push({
      raw: match[0],
      prefixTarget,
      startSeconds,
      endSeconds,
      isRange: endSeconds != null,
      index: match.index,
      length: match[0].length,
    })
  }

  return references
}

export function splitTextWithTimeReferences(text: string): TimeReferenceSegment[] {
  const references = extractTimeReferences(text)
  if (!references.length) return [{ type: 'text', value: text }]

  const segments: TimeReferenceSegment[] = []
  let cursor = 0

  for (const reference of references) {
    if (reference.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, reference.index) })
    }

    segments.push({ type: 'reference', value: reference })
    cursor = reference.index + reference.length
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) })
  }

  return segments
}

export function resolveTimeReferenceTarget(reference: TimeReference, defaultTarget: TimestampTarget): TimestampTarget {
  return reference.prefixTarget ?? defaultTarget
}
