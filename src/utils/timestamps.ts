export type TimestampTarget = 'track' | 'attachment'

export interface TimeReference {
  raw: string
  prefixTarget: TimestampTarget | null
  attachmentIndex: number | null
  zeroBasedAttachmentIndex: number | null
  startSeconds: number
  endSeconds: number | null
  isRange: boolean
  index: number
  length: number
}

export interface MarkerIndexReference {
  raw: string
  markerIndex: number
  zeroBasedIndex: number
  index: number
  length: number
}

export type TimeReferenceSegment =
  | { type: 'text'; value: string }
  | { type: 'reference'; value: TimeReference }

export type InlineReferenceSegment =
  | { type: 'text'; value: string }
  | { type: 'time'; value: TimeReference }
  | { type: 'marker'; value: MarkerIndexReference }

const TIME_VALUE = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\.\\d{1,3})?'
const TIME_REFERENCE_PATTERN = new RegExp(
  String.raw`(?<![\w])(?:(?<prefix>a\d*|t):)?(?<start>${TIME_VALUE})(?:\s*-\s*(?<end>${TIME_VALUE}))?(?![\w])`,
  'gi',
)
const MARKER_REFERENCE_PATTERN = /(?<![\w])#(?<index>\d{1,3})(?![\w])/g

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
    let prefixTarget: TimestampTarget | null = null
    let attachmentIndex: number | null = null

    if (prefix === 't') {
      prefixTarget = 'track'
    } else if (prefix?.startsWith('a')) {
      prefixTarget = 'attachment'
      const suffix = prefix.slice(1)
      if (suffix) {
        const parsedAttachmentIndex = Number(suffix)
        if (!Number.isInteger(parsedAttachmentIndex) || parsedAttachmentIndex <= 0) continue
        attachmentIndex = parsedAttachmentIndex
      }
    }

    references.push({
      raw: match[0],
      prefixTarget,
      attachmentIndex,
      zeroBasedAttachmentIndex: attachmentIndex == null ? null : attachmentIndex - 1,
      startSeconds,
      endSeconds,
      isRange: endSeconds != null,
      index: match.index,
      length: match[0].length,
    })
  }

  return references
}

export function extractMarkerIndexReferences(text: string): MarkerIndexReference[] {
  const matches = text.matchAll(new RegExp(MARKER_REFERENCE_PATTERN))
  const references: MarkerIndexReference[] = []

  for (const match of matches) {
    const markerIndexRaw = match.groups?.index
    if (!markerIndexRaw || match.index == null) continue
    const markerIndex = Number(markerIndexRaw)
    if (!Number.isInteger(markerIndex) || markerIndex <= 0) continue

    references.push({
      raw: match[0],
      markerIndex,
      zeroBasedIndex: markerIndex - 1,
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

export function splitTextWithInlineReferences(text: string): InlineReferenceSegment[] {
  const timeReferences = extractTimeReferences(text)
  const markerReferences = extractMarkerIndexReferences(text)

  if (!timeReferences.length && !markerReferences.length) {
    return [{ type: 'text', value: text }]
  }

  const allReferences: Array<
    | { type: 'time'; index: number; length: number; value: TimeReference }
    | { type: 'marker'; index: number; length: number; value: MarkerIndexReference }
  > = [
    ...timeReferences.map(reference => ({
      type: 'time' as const,
      index: reference.index,
      length: reference.length,
      value: reference,
    })),
    ...markerReferences.map(reference => ({
      type: 'marker' as const,
      index: reference.index,
      length: reference.length,
      value: reference,
    })),
  ]

  allReferences.sort((a, b) => a.index - b.index || b.length - a.length)

  const segments: InlineReferenceSegment[] = []
  let cursor = 0

  for (const reference of allReferences) {
    if (reference.index < cursor) continue

    if (reference.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, reference.index) })
    }

    if (reference.type === 'time') {
      segments.push({ type: 'time', value: reference.value })
    } else {
      segments.push({ type: 'marker', value: reference.value })
    }

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

export function resolveAttachmentReferenceIndex(
  reference: TimeReference,
  target: TimestampTarget,
  attachmentCount: number,
): number | null {
  if (target !== 'attachment' || attachmentCount <= 0) return null
  if (reference.zeroBasedAttachmentIndex != null) {
    return reference.zeroBasedAttachmentIndex < attachmentCount ? reference.zeroBasedAttachmentIndex : null
  }
  return attachmentCount === 1 ? 0 : null
}
