import { describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

import IssuePlaybackPreview from './IssuePlaybackPreview.vue'

function createPointerEvent(type: string, init: Record<string, unknown>) {
  if (typeof window.PointerEvent === 'function') {
    return new window.PointerEvent(type, init as PointerEventInit)
  }
  const event = new Event(type)
  Object.assign(event, init)
  return event
}

function mockRect(element: Element) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      left: 20,
      width: 200,
      top: 0,
      right: 220,
      bottom: 40,
      height: 40,
      x: 20,
      y: 0,
      toJSON: () => ({}),
    }),
  })
}

describe('IssuePlaybackPreview', () => {
  it('emits a play-sequence action when the transport button is pressed while paused', async () => {
    const wrapper = mountWithPlugins(IssuePlaybackPreview, {
      props: {
        issue: {
          id: 61,
          markers: [
            { id: 501, issue_id: 61, marker_type: 'point', time_start: 12.5, time_end: null },
            { id: 502, issue_id: 61, marker_type: 'range', time_start: 20, time_end: 24 },
          ],
        },
        duration: 90,
        currentTime: 0,
        isPreviewPlaying: false,
        activeMarkerIndex: null,
        peaks: [],
      },
    })

    await wrapper.get('.issue-preview-toggle').trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ type: 'playSequence' }]])
  })

  it('emits a pause action when the transport button is pressed while playing', async () => {
    const wrapper = mountWithPlugins(IssuePlaybackPreview, {
      props: {
        issue: {
          id: 61,
          markers: [{ id: 501, issue_id: 61, marker_type: 'range', time_start: 10, time_end: 14 }],
        },
        duration: 90,
        currentTime: 11,
        isPreviewPlaying: true,
        activeMarkerIndex: 0,
        peaks: [],
      },
    })

    await wrapper.get('.issue-preview-toggle').trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ type: 'pause' }]])
  })

  it('emits play-marker when a marker hitbox is clicked', async () => {
    const wrapper = mountWithPlugins(IssuePlaybackPreview, {
      props: {
        issue: {
          id: 62,
          markers: [
            { id: 601, issue_id: 62, marker_type: 'point', time_start: 8, time_end: null },
            { id: 602, issue_id: 62, marker_type: 'range', time_start: 30, time_end: 40 },
          ],
        },
        duration: 100,
        currentTime: 0,
        isPreviewPlaying: false,
        activeMarkerIndex: null,
        peaks: [],
      },
    })

    const hits = wrapper.findAll('.issue-preview-marker-hit')
    expect(hits.length).toBe(2)
    // Hits are rendered in sorted-by-start order, same as the markers above.
    await hits[1].trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ type: 'playMarker', index: 1 }]])
  })

  it('emits a seek action when the canvas is scrubbed outside a marker', async () => {
    const wrapper = mountWithPlugins(IssuePlaybackPreview, {
      props: {
        issue: {
          id: 63,
          markers: [{ id: 701, issue_id: 63, marker_type: 'range', time_start: 60, time_end: 70 }],
        },
        duration: 80,
        currentTime: 0,
        isPreviewPlaying: false,
        activeMarkerIndex: null,
        peaks: [],
      },
    })

    const canvas = wrapper.get('.issue-preview-canvas')
    mockRect(canvas.element)
    await canvas.trigger('pointerdown', {
      clientX: 60,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
    })
    window.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 120,
      pointerId: 1,
      pointerType: 'mouse',
    }))
    window.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 120,
      pointerId: 1,
      pointerType: 'mouse',
    }))

    const emitted = wrapper.emitted('action') as unknown as Array<[{ type: string; time: number }]>
    expect(emitted.length).toBeGreaterThanOrEqual(2)
    // First seek: pointerdown at clientX 60 → ratio 0.2 → 80 * 0.2 = 16.
    expect(emitted[0][0]).toEqual({ type: 'seek', time: 16 })
    // Second seek: pointermove at clientX 120 → ratio 0.5 → 40.
    expect(emitted[1][0]).toEqual({ type: 'seek', time: 40 })
  })
})
