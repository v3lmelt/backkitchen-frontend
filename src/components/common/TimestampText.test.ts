import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  issueGetMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  issueApi: {
    get: mocks.issueGetMock,
  },
}))

import TimestampText from './TimestampText.vue'

describe('TimestampText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mocks.issueGetMock.mockReset()
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

  it('emits issueActivate and shows a preview for known issues', async () => {
    const wrapper = mountWithPlugins(TimestampText, {
      attachTo: document.body,
      props: {
        text: 'Refer to @issue:12 before shipping',
        issues: [
          {
            id: 12,
            track_id: 4,
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
            markers: [{ id: 1, issue_id: 12, marker_type: 'point', time_start: 42.4, time_end: null }],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            comments: [],
          },
        ],
      },
    })

    const [issueButton] = wrapper.findAll('button')
    expect(issueButton.text()).toBe('@issue:12')

    await issueButton.trigger('mouseenter')
    await flushPromises()

    expect(document.body.textContent).toContain('Low end masking')
    expect(document.body.textContent).toContain('Kick and bass are colliding')
    expect(mocks.issueGetMock).not.toHaveBeenCalled()

    await issueButton.trigger('click')
    expect(wrapper.emitted('issueActivate')).toEqual([
      [{ raw: '@issue:12', issueId: 12, index: 9, length: 9 }],
    ])

    wrapper.unmount()
  })

  it('lazy loads unknown issue previews on hover', async () => {
    mocks.issueGetMock.mockResolvedValue({
      id: 99,
      track_id: 8,
      author_id: 3,
      phase: 'mastering',
      workflow_cycle: 2,
      source_version_id: null,
      source_version_number: 5,
      master_delivery_id: null,
      title: 'Sibilance spike',
      description: 'The lead vocal gets too sharp on the bridge.',
      severity: 'minor',
      status: 'pending_discussion',
      markers: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      comments: [],
    })

    const wrapper = mountWithPlugins(TimestampText, {
      attachTo: document.body,
      props: {
        text: 'Escalate @issue:99 next',
      },
    })

    const [issueButton] = wrapper.findAll('button')
    await issueButton.trigger('mouseenter')
    await flushPromises()

    expect(mocks.issueGetMock).toHaveBeenCalledWith(99)
    expect(document.body.textContent).toContain('Sibilance spike')

    wrapper.unmount()
  })
})
