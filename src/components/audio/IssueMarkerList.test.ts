import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  severity: 'major',
  status: 'open',
  markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 5.123, time_end: null }],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  comment_count: 0,
  ...overrides,
})

describe('IssueMarkerList', () => {
  beforeEach(() => { localStorage.clear() })
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
        issues: [makeIssue({ markers: [{ id: 1, issue_id: 1, marker_type: 'range', time_start: 2.0, time_end: 5.5 }] })],
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
    localStorage.setItem('backkitchen_user', JSON.stringify({ id: 10, role: 'member' }))
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [makeIssue()],
        selectable: true,
        selectedIds: [],
        track: { id: 1, submitter_id: 2 },
      },
    })
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
  })

  it('emits update:selectedIds when checkbox toggled', async () => {
    localStorage.setItem('backkitchen_user', JSON.stringify({ id: 10, role: 'member' }))
    const issue = makeIssue({ id: 5 })
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [issue],
        selectable: true,
        selectedIds: [],
        track: { id: 1, submitter_id: 2 },
      },
    })
    await wrapper.find('input[type="checkbox"]').trigger('click')
    expect(wrapper.emitted('update:selectedIds')).toBeTruthy()
    expect(wrapper.emitted('update:selectedIds')![0]).toEqual([[5]])
  })

  it('emits quick status actions without selecting the issue', async () => {
    localStorage.setItem('backkitchen_user', JSON.stringify({ id: 2, display_name: 'Nova', role: 'member' }))
    const issue = makeIssue({ author_id: 10, status: 'open' })
    const wrapper = mountWithPlugins(IssueMarkerList, {
      props: {
        issues: [issue],
        track: {
          id: 1,
          submitter_id: 2,
          producer_id: 8,
          peer_reviewer_id: 9,
        },
        enableQuickActions: true,
      },
    })

    const resolvedButton = wrapper.findAll('button').find(button => button.text() === 'Mark Resolved')
    expect(resolvedButton).toBeTruthy()
    await resolvedButton!.trigger('click')

    expect(wrapper.emitted('status-change')).toEqual([[{ issue, status: 'resolved' }]])
    expect(wrapper.emitted('select')).toBeUndefined()
  })
  it('orders all unresolved states by severity and folds both resolved states with counts', async () => {
    const wrapper = mountWithPlugins(IssueMarkerList, { props: { groupByStatus: true, issues: [
      makeIssue({ id: 1, title: 'Minor old', status: 'disagreed', severity: 'minor', workflow_cycle: 1 }),
      makeIssue({ id: 2, title: 'Critical old', status: 'pending_discussion', severity: 'critical' }),
      makeIssue({ id: 3, title: 'Closed', status: 'resolved' }),
      makeIssue({ id: 4, title: 'Internal closed', status: 'internal_resolved' }),
      makeIssue({ id: 5, title: 'Major newer', status: 'open', severity: 'major' }),
    ] } })
    expect(wrapper.findAll('[data-issue-id]').map(row => row.attributes('data-issue-id'))).toEqual(['2', '5', '1'])
    expect(wrapper.text()).toContain('Resolved · 2')
    expect(wrapper.text()).not.toContain('Internal closed')
    await wrapper.find('button[aria-expanded]').trigger('click')
    expect(wrapper.text()).toContain('Internal closed')
    expect(wrapper.findAll('[data-issue-id]').map(row => row.attributes('data-issue-id'))).toEqual(['2', '5', '1', '3', '4'])
  })

  it('omits ineligible batch checkboxes and prunes selections after permissions change', async () => {
    localStorage.setItem('backkitchen_user', JSON.stringify({ id: 10, role: 'member' }))
    const wrapper = mountWithPlugins(IssueMarkerList, { props: {
      selectable: true, selectedIds: [1, 2], track: { id: 1, submitter_id: 2 },
      issues: [makeIssue(), makeIssue({ id: 2, author_id: 11, phase: 'producer' })],
    } })
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
    expect(wrapper.emitted('update:selectedIds')?.at(-1)).toEqual([[1]])
    await wrapper.setProps({ issues: [makeIssue({ author_id: 11 }), makeIssue({ id: 2, author_id: 11, phase: 'producer' })], selectedIds: [1] })
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(wrapper.emitted('update:selectedIds')?.at(-1)).toEqual([[]])
  })

  it('keeps exact master cycle/version labels even when track delivery history is redacted', () => {
    const wrapper = mountWithPlugins(IssueMarkerList, { props: { issues: [
      makeIssue({ master_delivery_id: 22, master_delivery_number: 1, master_delivery_workflow_cycle: 2 }),
      makeIssue({ id: 2, master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 }),
    ], track: { id: 1, current_master_delivery: null } } })
    expect(wrapper.text()).toContain('Cycle 2 · Master v1')
    expect(wrapper.text()).toContain('Cycle 1 · Master v1')
  })
})
