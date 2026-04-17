import { describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

import IssuePlaybackPreview from './IssuePlaybackPreview.vue'

describe('IssuePlaybackPreview', () => {
  it('emits transport and seek controls for the drawer preview', async () => {
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
        currentTime: 12.5,
        isPlaying: false,
        isActive: true,
      },
    })

    await wrapper.get('.issue-preview-back').trigger('click')
    await wrapper.get('.issue-preview-toggle').trigger('click')
    await wrapper.get('.issue-preview-forward').trigger('click')
    await wrapper.get('.issue-preview-slider').setValue(33.3)
    await wrapper.get('.issue-preview-marker-chip').trigger('click')

    expect(wrapper.emitted('seek')).toEqual([[7.5], [17.5], [33.3]])
    expect(wrapper.emitted('toggle')).toEqual([[]])
    expect(wrapper.emitted('preview')).toEqual([[12.5]])
  })

  it('seeks when the mini timeline itself is clicked', async () => {
    const wrapper = mountWithPlugins(IssuePlaybackPreview, {
      props: {
        issue: {
          id: 62,
          markers: [{ id: 503, issue_id: 62, marker_type: 'point', time_start: 10, time_end: null }],
        },
        duration: 80,
        currentTime: 10,
        isPlaying: false,
        isActive: true,
      },
    })

    const timeline = wrapper.get('.issue-preview-timeline')
    Object.defineProperty(timeline.element, 'getBoundingClientRect', {
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

    await timeline.trigger('click', { clientX: 120 })

    expect(wrapper.emitted('seek')).toEqual([[40]])
  })
})
