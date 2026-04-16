import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: {
    name: 'track-detail',
    path: '/tracks/7',
    fullPath: '/tracks/7',
    params: { id: '7' },
    query: {} as Record<string, string>,
  },
  pushMock: vi.fn(),
  openMock: vi.fn(),
  trackGetMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
  trackReopenMock: vi.fn(),
  trackRequestReopenMock: vi.fn(),
  discussionCreateMock: vi.fn(),
  currentUser: { id: 2 },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    listAssignments: mocks.listAssignmentsMock,
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
    props: ['audioUrl', 'compareVersionId', 'compareAudioUrl', 'issues', 'playbackScope'],
    template: '<div class="waveform">scope:{{ playbackScope ?? "source" }} audio:{{ audioUrl ?? "none" }} compare:{{ compareVersionId ?? "none" }} compareAudio:{{ compareAudioUrl ?? "none" }} issues:{{ issues?.length ?? 0 }}</div>',
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
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: `
      <div class="compare-select">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="compare-option"
          @click="$emit('update:modelValue', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    `,
  },
}))

vi.mock('@/components/common/CommentInput.vue', () => ({
  default: {
    emits: ['submit'],
    data: () => ({ content: '' }),
    methods: {
      reset(this: { content: string }) {
        this.content = ''
      },
    },
    template: `
      <div>
        <textarea v-model="content"></textarea>
        <button class="comment-submit" @click="$emit('submit', { content, images: [], audios: [] })">submit</button>
      </div>
    `,
  },
}))

import TrackDetailView from './TrackDetailView.vue'

function mountTrackDetailView() {
  return mountWithPlugins(TrackDetailView, {
    global: {
      mocks: {
        $route: mocks.route,
      },
    },
  })
}

describe('TrackDetailView', () => {
  beforeEach(() => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7',
      params: { id: '7' },
      query: {},
    }
    mocks.pushMock.mockReset()
    mocks.openMock.mockReset()
    mocks.discussionCreateMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
    mocks.trackReopenMock.mockReset()
    mocks.trackRequestReopenMock.mockReset()
    vi.stubGlobal('open', mocks.openMock)
    mocks.trackReopenMock.mockResolvedValue({})
    mocks.trackRequestReopenMock.mockResolvedValue({})
    mocks.listAssignmentsMock.mockResolvedValue([])
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
    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.issue-list').text()).toBe('2')
    expect(wrapper.find('.waveform').text()).toContain('compare:none')

    await wrapper.find('textarea').setValue(' Fresh discussion ')
    await wrapper.find('button.comment-submit').trigger('click')
    await flushPromises()

    expect(mocks.discussionCreateMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ content: 'Fresh discussion' }),
      expect.any(Function),
    )
    expect(wrapper.text()).toContain('Fresh discussion')
  })

  it('opens compare mode from the route query', async () => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7?compareVersion=201',
      params: { id: '7' },
      query: { compareVersion: '201' },
    }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.waveform').text()).toContain('compare:201')
  })

  it('renders current master audio in a separate waveform and filters master issues to the active delivery', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'mastering',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: [],
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: {
          id: 21,
          delivery_number: 4,
          workflow_cycle: 2,
          file_path: 'master-v4.wav',
          created_at: '2024-01-04T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
      },
      issues: [
        { id: 11, phase: 'final_review', workflow_cycle: 2, master_delivery_id: 21, title: 'Current delivery issue' },
        { id: 12, phase: 'final_review', workflow_cycle: 2, master_delivery_id: 20, title: 'Older delivery issue' },
        { id: 13, phase: 'peer', workflow_cycle: 2, source_version_number: 3, title: 'Source issue' },
      ],
      discussions: [],
      events: [],
      source_versions: [{ id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' }],
      master_deliveries: [
        {
          id: 21,
          delivery_number: 4,
          workflow_cycle: 2,
          file_path: 'master-v4.wav',
          created_at: '2024-01-04T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
        {
          id: 20,
          delivery_number: 3,
          workflow_cycle: 2,
          file_path: 'master-v3.wav',
          created_at: '2024-01-03T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
      ],
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const waveforms = wrapper.findAll('.waveform')
    expect(waveforms).toHaveLength(2)
    expect(waveforms[1].text()).toContain('scope:master')
    expect(waveforms[1].text()).toContain('audio:/api/tracks/7/master-audio?v=4&c=2')
    expect(waveforms[1].text()).toContain('issues:1')
    expect(waveforms[1].text()).toContain('compare:none')
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

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const buttons = wrapper.findAll('button.workflow-cta-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons.every(button => button.text().includes('Open Intake'))).toBe(true)

    await buttons[0].trigger('click')
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/7/step/intake', query: undefined })
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

    const wrapper = mountTrackDetailView()
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
