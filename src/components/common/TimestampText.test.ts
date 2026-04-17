import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

import TimestampText from './TimestampText.vue'

describe('TimestampText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('highlights references and emits resolved targets on click', async () => {
    const wrapper = mountWithPlugins(TimestampText, {
      props: {
        text: 'A 03:15 and t:04:20-04:30',
        defaultTarget: 'attachment',
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('03:15')
    expect(buttons[1].text()).toBe('t:04:20-04:30')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('activate')).toEqual([
      [{
        raw: '03:15',
        prefixTarget: null,
        attachmentIndex: null,
        zeroBasedAttachmentIndex: null,
        startSeconds: 195,
        endSeconds: null,
        isRange: false,
        index: 2,
        length: 5,
      }, 'attachment'],
      [{
        raw: 't:04:20-04:30',
        prefixTarget: 'track',
        attachmentIndex: null,
        zeroBasedAttachmentIndex: null,
        startSeconds: 260,
        endSeconds: 270,
        isRange: true,
        index: 12,
        length: 13,
      }, 'track'],
    ])
  })

  it('emits markerActivate when clicking #i references', async () => {
    const wrapper = mountWithPlugins(TimestampText, {
      props: {
        text: 'Please review #2 then #1',
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('#2')
    expect(buttons[1].text()).toBe('#1')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('markerActivate')).toEqual([
      [{ raw: '#2', markerIndex: 2, zeroBasedIndex: 1, index: 14, length: 2 }],
      [{ raw: '#1', markerIndex: 1, zeroBasedIndex: 0, index: 22, length: 2 }],
    ])
  })

  it('emits issueActivate with resolved issue and shows a preview when @issue:N matches a track-local number', async () => {
    const issue = {
      id: 412,
      track_id: 4,
      local_number: 2,
      author_id: 2,
      phase: 'producer',
      workflow_cycle: 1,
      source_version_id: null,
      source_version_number: 3,
      master_delivery_id: null,
      title: 'Low end masking',
      description: 'Kick and bass are colliding in the chorus and the tail feels too long.',
      severity: 'major',
      status: 'open',
      markers: [{ id: 1, issue_id: 412, marker_type: 'point', time_start: 42.4, time_end: null }],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      comments: [],
    }

    const wrapper = mountWithPlugins(TimestampText, {
      attachTo: document.body,
      props: {
        text: 'Refer to @issue:2 before shipping',
        issues: [issue],
      },
    })

    const [issueButton] = wrapper.findAll('button')
    expect(issueButton.text()).toBe('@issue:2')

    await issueButton.trigger('mouseenter')
    await flushPromises()

    expect(document.body.textContent).toContain('Low end masking')
    expect(document.body.textContent).toContain('Kick and bass are colliding')

    await issueButton.trigger('click')
    expect(wrapper.emitted('issueActivate')).toEqual([[issue]])

    wrapper.unmount()
  })

  it('renders a deleted pill (no preview button) when @issue:N has no matching local number on the track', () => {
    const wrapper = mountWithPlugins(TimestampText, {
      attachTo: document.body,
      props: {
        text: 'Escalate @issue:99 next',
        issues: [],
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(0)

    const deletedPill = wrapper.find('span.line-through')
    expect(deletedPill.exists()).toBe(true)
    expect(deletedPill.text()).toBe('@issue:99')

    wrapper.unmount()
  })
})
