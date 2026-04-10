import { describe, expect, it } from 'vitest'

import {
  extractMarkerIndexReferences,
  extractTimeReferences,
  parseTimecode,
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
    expect(extractTimeReferences('Try 03:15, t:04:20 and a:05:00-05:12.500')).toEqual([
      {
        raw: '03:15',
        prefixTarget: null,
        startSeconds: 195,
        endSeconds: null,
        isRange: false,
        index: 4,
        length: 5,
      },
      {
        raw: 't:04:20',
        prefixTarget: 'track',
        startSeconds: 260,
        endSeconds: null,
        isRange: false,
        index: 11,
        length: 7,
      },
      {
        raw: 'a:05:00-05:12.500',
        prefixTarget: 'attachment',
        startSeconds: 300,
        endSeconds: 312.5,
        isRange: true,
        index: 23,
        length: 17,
      },
    ])
  })

  it('ignores invalid ranges', () => {
    expect(extractTimeReferences('Skip 04:10-03:59')).toEqual([])
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
})
