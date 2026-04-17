import { describe, expect, it } from 'vitest'

import {
  extractIssueReferences,
  extractMarkerIndexReferences,
  extractTimeReferences,
  parseTimecode,
  resolveAttachmentReferenceIndex,
  resolveTimeReferenceTarget,
  splitTextWithInlineReferences,
  splitTextWithTimeReferences,
} from './timestamps'

describe('parseTimecode', () => {
  it('parses minutes and seconds', () => {
    expect(parseTimecode('03:15')).toBe(195)
    expect(parseTimecode('3:15.250')).toBe(195.25)
  })

  it('parses hour-based timecodes', () => {
    expect(parseTimecode('1:02:03.5')).toBe(3723.5)
  })

  it('rejects invalid timecodes', () => {
    expect(parseTimecode('03:99')).toBeNull()
    expect(parseTimecode('abc')).toBeNull()
  })
})

describe('extractTimeReferences', () => {
  it('extracts points and ranges with optional target prefixes', () => {
    expect(extractTimeReferences('Try 03:15, t:04:20 and a2:05:00-05:12.500')).toEqual([
      {
        raw: '03:15',
        prefixTarget: null,
        attachmentIndex: null,
        zeroBasedAttachmentIndex: null,
        startSeconds: 195,
        endSeconds: null,
        isRange: false,
        index: 4,
        length: 5,
      },
      {
        raw: 't:04:20',
        prefixTarget: 'track',
        attachmentIndex: null,
        zeroBasedAttachmentIndex: null,
        startSeconds: 260,
        endSeconds: null,
        isRange: false,
        index: 11,
        length: 7,
      },
      {
        raw: 'a2:05:00-05:12.500',
        prefixTarget: 'attachment',
        attachmentIndex: 2,
        zeroBasedAttachmentIndex: 1,
        startSeconds: 300,
        endSeconds: 312.5,
        isRange: true,
        index: 23,
        length: 18,
      },
    ])
  })

  it('ignores invalid ranges', () => {
    expect(extractTimeReferences('Skip 04:10-03:59')).toEqual([])
  })

  it('rejects invalid attachment prefixes', () => {
    expect(extractTimeReferences('Skip a0:03:15')).toEqual([])
  })
})

describe('splitTextWithTimeReferences', () => {
  it('splits plain text around detected references', () => {
    expect(splitTextWithTimeReferences('A 03:15 and 04:10-04:20 B')).toEqual([
      { type: 'text', value: 'A ' },
      {
        type: 'reference',
        value: {
          raw: '03:15',
          prefixTarget: null,
          attachmentIndex: null,
          zeroBasedAttachmentIndex: null,
          startSeconds: 195,
          endSeconds: null,
          isRange: false,
          index: 2,
          length: 5,
        },
      },
      { type: 'text', value: ' and ' },
      {
        type: 'reference',
        value: {
          raw: '04:10-04:20',
          prefixTarget: null,
          attachmentIndex: null,
          zeroBasedAttachmentIndex: null,
          startSeconds: 250,
          endSeconds: 260,
          isRange: true,
          index: 12,
          length: 11,
        },
      },
      { type: 'text', value: ' B' },
    ])
  })
})

describe('resolveTimeReferenceTarget', () => {
  it('prefers explicit prefixes over context default', () => {
    const [reference] = extractTimeReferences('a:03:15')
    expect(resolveTimeReferenceTarget(reference, 'track')).toBe('attachment')
  })
})

describe('resolveAttachmentReferenceIndex', () => {
  it('uses explicit attachment indices when present', () => {
    const [reference] = extractTimeReferences('a2:03:15')
    expect(resolveAttachmentReferenceIndex(reference, 'attachment', 3)).toBe(1)
  })

  it('keeps legacy single-attachment references working', () => {
    const [reference] = extractTimeReferences('a:03:15')
    expect(resolveAttachmentReferenceIndex(reference, 'attachment', 1)).toBe(0)
  })

  it('treats attachment references as ambiguous when multiple attachments exist without an index', () => {
    const [reference] = extractTimeReferences('03:15')
    expect(resolveAttachmentReferenceIndex(reference, 'attachment', 2)).toBeNull()
  })

  it('returns null for out-of-range explicit attachment indices', () => {
    const [reference] = extractTimeReferences('a3:03:15')
    expect(resolveAttachmentReferenceIndex(reference, 'attachment', 2)).toBeNull()
  })
})

describe('extractMarkerIndexReferences', () => {
  it('extracts marker number references in #i format', () => {
    expect(extractMarkerIndexReferences('Fix #1 and compare #12, skip #0')).toEqual([
      {
        raw: '#1',
        markerIndex: 1,
        zeroBasedIndex: 0,
        index: 4,
        length: 2,
      },
      {
        raw: '#12',
        markerIndex: 12,
        zeroBasedIndex: 11,
        index: 19,
        length: 3,
      },
    ])
  })
})

describe('extractIssueReferences', () => {
  it('extracts @issue:id references', () => {
    expect(extractIssueReferences('See @issue:7, compare @issue:42, skip @issue:0')).toEqual([
      {
        raw: '@issue:7',
        localNumber: 7,
        index: 4,
        length: 8,
      },
      {
        raw: '@issue:42',
        localNumber: 42,
        index: 22,
        length: 9,
      },
    ])
  })
})

describe('splitTextWithInlineReferences', () => {
  it('splits text with both time and marker references', () => {
    expect(splitTextWithInlineReferences('At #2 check 03:15 and #1')).toEqual([
      { type: 'text', value: 'At ' },
      {
        type: 'marker',
        value: {
          raw: '#2',
          markerIndex: 2,
          zeroBasedIndex: 1,
          index: 3,
          length: 2,
        },
      },
      { type: 'text', value: ' check ' },
      {
        type: 'time',
        value: {
          raw: '03:15',
          prefixTarget: null,
          attachmentIndex: null,
          zeroBasedAttachmentIndex: null,
          startSeconds: 195,
          endSeconds: null,
          isRange: false,
          index: 12,
          length: 5,
        },
      },
      { type: 'text', value: ' and ' },
      {
        type: 'marker',
        value: {
          raw: '#1',
          markerIndex: 1,
          zeroBasedIndex: 0,
          index: 22,
          length: 2,
        },
      },
    ])
  })

  it('keeps issue references in the merged segment list', () => {
    expect(splitTextWithInlineReferences('Link @issue:9 at 03:15 after #2')).toEqual([
      { type: 'text', value: 'Link ' },
      {
        type: 'issue',
        value: {
          raw: '@issue:9',
          localNumber: 9,
          index: 5,
          length: 8,
        },
      },
      { type: 'text', value: ' at ' },
      {
        type: 'time',
        value: {
          raw: '03:15',
          prefixTarget: null,
          attachmentIndex: null,
          zeroBasedAttachmentIndex: null,
          startSeconds: 195,
          endSeconds: null,
          isRange: false,
          index: 17,
          length: 5,
        },
      },
      { type: 'text', value: ' after ' },
      {
        type: 'marker',
        value: {
          raw: '#2',
          markerIndex: 2,
          zeroBasedIndex: 1,
          index: 29,
          length: 2,
        },
      },
    ])
  })
})
