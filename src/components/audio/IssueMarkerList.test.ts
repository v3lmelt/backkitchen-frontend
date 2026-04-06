import { describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: {
    props: ['status', 'type'],
    template: '<span class="badge">{{ status }}</span>',
  },
}))

import IssueMarkerList from './IssueMarkerList.vue'

const makeIssue = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  track_id: 1,
  author_id: 10,
  phase: 'peer',
  workflow_cycle: 1,
  source_version_id: null,
  master_delivery_id: null,
  title: 'Test Issue',
  description: 'desc',
  issue_type: 'point',
  severity: 'major',
  status: 'open',
  time_start: 5.123,
  time_end: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  comment_count: 0,
  ...overrides,
})

describe('IssueMarkerList', () => {
  it('renders issue title and timestamp', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue()],
      },
    })
    expect(wrapper.text()).toContain('Test Issue')
    expect(wrapper.text()).toContain('0:05.1')
  })

  it('shows empty message when no issues', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: { issues: [] },
    })
    expect(wrapper.text()).toBeTruthy() // i18n key for "no issues"
  })

  it('emits select event on click', async () => {
    const issue = makeIssue()
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: { issues: [issue] },
    })
    await wrapper.find('.card').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual([issue])
  })

  it('renders range timestamp when time_end is set', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ time_start: 2.0, time_end: 5.5 })],
      },
    })
    expect(wrapper.text()).toContain('0:02.0')
    expect(wrapper.text()).toContain('0:05.5')
  })

  it('shows comment count when present', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ comment_count: 3 })],
      },
    })
    expect(wrapper.text()).toContain('3')
  })

  it('shows source version badge when available', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ source_version_number: 2 })],
      },
    })
    expect(wrapper.text()).toContain('v2')
  })

  it('visually fades issues from non-current source versions', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ source_version_number: 1 })],
        currentSourceVersionNumber: 2,
      },
    })

    expect(wrapper.find('.card').classes()).toContain('opacity-60')
    expect(wrapper.find('h4').classes()).toContain('text-muted-foreground')
  })

  it('shows hashed author id for peer phase issues', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ phase: 'peer', author_id: 42 })],
      },
    })
    // Should show a hex hash, not the raw id
    expect(wrapper.text()).toContain('#')
    expect(wrapper.text()).not.toContain('#42')
  })

  it('shows author display name for non-peer phase issues', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue({ phase: 'mastering', author_id: 42, author: { display_name: 'Alice' } })],
      },
    })
    expect(wrapper.text()).toContain('Alice')
  })

  it('renders checkboxes in selectable mode', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue()],
        selectable: true,
        selectedIds: [],
      },
    })
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
  })

  it('emits update:selectedIds when checkbox toggled', async () => {
    const issue = makeIssue({ id: 5 })
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [issue],
        selectable: true,
        selectedIds: [],
      },
    })
    await wrapper.find('input[type="checkbox"]').trigger('click')
    expect(wrapper.emitted('update:selectedIds')).toBeTruthy()
    expect(wrapper.emitted('update:selectedIds')![0]).toEqual([[5]])
  })
})
