import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: { params: { id: '7' }, query: {} as Record<string, string> },
  pushMock: vi.fn(),
  openMock: vi.fn(),
  trackGetMock: vi.fn(),
  trackReopenMock: vi.fn(),
  trackRequestReopenMock: vi.fn(),
  discussionCreateMock: vi.fn(),
  currentUser: { id: 2 },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    reopen: mocks.trackReopenMock,
    requestReopen: mocks.trackRequestReopenMock,
  },
  discussionApi: { create: mocks.discussionCreateMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/components/audio/WaveformPlayer.vue', () => ({
  default: {
    props: ['compareVersionId'],
    template: '<div class="waveform">compare:{{ compareVersionId ?? "none" }}</div>',
  },
}))

vi.mock('@/components/audio/IssueMarkerList.vue', () => ({
  default: {
    props: ['issues'],
    template: '<div class="issue-list">{{ issues.length }}</div>',
  },
}))

vi.mock('@/components/workflow/WorkflowProgress.vue', () => ({
  default: {
    template: '<div class="workflow-progress"></div>',
  },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<div class="status-badge" />' },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    template: '<div class="compare-select"></div>',
  },
}))

import TrackDetailView from './TrackDetailView.vue'

describe('TrackDetailView', () => {
  beforeEach(() => {
    mocks.route = { params: { id: '7' }, query: {} }
    mocks.pushMock.mockReset()
    mocks.openMock.mockReset()
    mocks.discussionCreateMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.trackReopenMock.mockReset()
    mocks.trackRequestReopenMock.mockReset()
    vi.stubGlobal('open', mocks.openMock)
    mocks.trackReopenMock.mockResolvedValue({})
    mocks.trackRequestReopenMock.mockResolvedValue({})
    mocks.trackGetMock.mockResolvedValue({
      track: {
        id: 7,
        album_id: 5,
        status: 'peer_review',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['peer_review'],
        open_issue_count: 1,
        submitter: { display_name: 'Nova' },
        peer_reviewer: { id: 4, display_name: 'Echo' },
        current_source_version: { id: 301 },
        current_master_delivery: null,
      },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 2, source_version_number: 3, title: 'Current version' },
        { id: 2, phase: 'peer', workflow_cycle: 2, source_version_number: 2, title: 'Older version' },
        { id: 3, phase: 'peer', workflow_cycle: 1, source_version_number: 3, title: 'Older cycle' },
      ],
      discussions: [],
      events: [],
      source_versions: [
        { id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' },
        { id: 201, version_number: 2, created_at: '2024-01-02T00:00:00Z' },
      ],
    })
    mocks.discussionCreateMock.mockResolvedValue({
      id: 99,
      content: 'Fresh discussion',
      created_at: '2024-01-04T00:00:00Z',
      author: { display_name: 'Nova', avatar_color: '#123456' },
      images: [],
    })
  })

  it('filters issue lists and posts a discussion', async () => {
    const wrapper = mountWithPlugins(TrackDetailView)
    await flushPromises()

    expect(wrapper.find('.issue-list').text()).toBe('2')
    expect(wrapper.find('.waveform').text()).toContain('compare:none')

    await wrapper.find('textarea').setValue(' Fresh discussion ')
    await wrapper.find('button.btn-primary.text-sm').trigger('click')
    await flushPromises()

    expect(mocks.discussionCreateMock).toHaveBeenCalledWith(7, { content: 'Fresh discussion' })
    expect(wrapper.text()).toContain('Fresh discussion')
  })

  it('opens compare mode from the route query and navigates workflow actions', async () => {
    mocks.route = { params: { id: '7' }, query: { compareVersion: '201' } }

    const wrapper = mountWithPlugins(TrackDetailView)
    await flushPromises()

    expect(wrapper.find('.waveform').text()).toContain('compare:201')

    await wrapper.find('button.workflow-cta-btn').trigger('click')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/7/review')
  })

  it('shows a single step CTA for custom workflows', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'intake',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['accept', 'reject_final'],
        workflow_step: { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: {} },
        open_issue_count: 1,
        submitter: { display_name: 'Nova' },
        peer_reviewer: { id: 4, display_name: 'Echo' },
        current_source_version: { id: 301 },
        current_master_delivery: null,
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [{ id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' }],
      workflow_config: { version: 2, steps: [{ id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: { accept: 'peer_review' } }] },
    })

    const wrapper = mountWithPlugins(TrackDetailView)
    await flushPromises()

    const buttons = wrapper.findAll('button.workflow-cta-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons.every(button => button.text().includes('Open Intake'))).toBe(true)

    await buttons[0].trigger('click')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/7/step/intake')
  })

  it('prioritizes remaster reopen targets and labels them clearly', async () => {
    mocks.currentUser = { id: 2 }
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'completed',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        mastering_engineer_id: 9,
        allowed_actions: [],
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: { producer_approved_at: '2024-01-01T00:00:00Z', submitter_approved_at: '2024-01-02T00:00:00Z' },
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [{ id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' }],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'producer_revision', label: 'Producer Revision', type: 'revision', assignee_role: 'submitter', order: 2, transitions: {} },
          { id: 'mastering_revision', label: 'Mastering Revision', type: 'revision', assignee_role: 'submitter', order: 3, transitions: {} },
          { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 4, transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(TrackDetailView)
    await flushPromises()

    const reopenButton = wrapper.findAll('button').find(button => button.text().includes('Request Workflow Reopen'))
    expect(reopenButton).toBeTruthy()
    await reopenButton!.trigger('click')
    await flushPromises()

    const options = wrapper.findAll('option').map(option => option.text())
    expect(options[1]).toContain('remaster current delivery')
    expect(options[2]).toContain('revise source first, then remaster')
  })
})
