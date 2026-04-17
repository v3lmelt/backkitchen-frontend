import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: { params: { id: '9' }, query: {} as Record<string, string>, path: '/tracks/9/mastering', fullPath: '/tracks/9/mastering' },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  trackGetMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
  updateMasteringNotesMock: vi.fn(),
  uploadMasterDeliveryMock: vi.fn(),
  approveFinalReviewMock: vi.fn(),
  confirmDeliveryMock: vi.fn(),
  workflowTransitionMock: vi.fn(),
  issueUpdateMock: vi.fn(),
  setCurrentTrackMock: vi.fn(),
  downloadTrackAudioMock: vi.fn(),
  downloadAudioAssetMock: vi.fn(),
  waveformPlayFromMock: vi.fn(),
  waveformTogglePlayMock: vi.fn(),
  currentUser: { id: 2 },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    listAssignments: mocks.listAssignmentsMock,
    updateMasteringNotes: mocks.updateMasteringNotesMock,
    uploadMasterDelivery: mocks.uploadMasterDeliveryMock,
    approveFinalReview: mocks.approveFinalReviewMock,
    confirmDelivery: mocks.confirmDeliveryMock,
    workflowTransition: mocks.workflowTransitionMock,
  },
  issueApi: {
    update: mocks.issueUpdateMock,
  },
  r2Api: {
    requestMasterDeliveryUpload: vi.fn(),
    confirmMasterDeliveryUpload: vi.fn(),
  },
  uploadToR2: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: mocks.currentUser,
    r2Enabled: false,
  }),
}))

vi.mock('@/stores/tracks', () => ({
  useTrackStore: () => ({
    setCurrentTrack: mocks.setCurrentTrackMock,
  }),
}))

vi.mock('@/components/audio/WaveformPlayer.vue', () => ({
  default: {
    emits: ['ready', 'timeupdate', 'playbackStateChange'],
    mounted(this: any) {
      this.$emit('ready', 95)
      this.$emit('timeupdate', 12.5)
      this.$emit('playbackStateChange', false)
    },
    methods: {
      playFrom: mocks.waveformPlayFromMock,
      togglePlay: mocks.waveformTogglePlayMock,
    },
    template: '<div class="waveform" />',
  },
}))

vi.mock('@/components/audio/IssueMarkerList.vue', () => ({
  default: {
    props: ['issues'],
    emits: ['select'],
    template: `
      <div>
        <div class="issue-list">{{ issues.length }}</div>
        <button
          v-for="issue in issues"
          :key="issue.id"
          class="issue-list-item"
          @click="$emit('select', issue)"
        >
          {{ issue.title }}
        </button>
      </div>
    `,
  },
}))

vi.mock('@/components/IssueCreatePanel.vue', () => ({
  default: {
    template: '<div class="issue-create" />',
  },
}))

vi.mock('@/components/IssueDetailPanel.vue', () => ({
  default: {
    props: ['issue', 'preview'],
    emits: ['close', 'updated', 'preview-play-at', 'preview-action'],
    template: `
      <div v-if="issue" class="issue-drawer">
        {{ issue.title }}|{{ issue.status }}|preview:{{ preview?.duration ?? 0 }}|playing:{{ preview?.isPreviewPlaying ? '1' : '0' }}|marker:{{ preview?.activeMarkerIndex ?? '-' }}
        <button class="drawer-preview-play" @click="$emit('preview-play-at', 18.25)">preview play</button>
        <button class="drawer-preview-toggle" @click="$emit('preview-action', issue, { type: 'playSequence' })">preview toggle</button>
      </div>
    `,
  },
}))

vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({
  default: {
    props: ['actions'],
    template: '<div class="workflow-action-bar">{{ actions.map(action => action.label).join("|") }}</div>',
  },
}))

vi.mock('@/components/workflow/BatchIssueActions.vue', () => ({
  default: {
    template: '<div class="batch-issue-actions" />',
  },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: {
    template: '<div class="skeleton-loader" />',
  },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: {
    template: '<div class="status-badge" />',
  },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    template: '<div class="custom-select" />',
  },
}))

vi.mock('@/components/common/DiscussionPanel.vue', () => ({
  default: {
    props: ['heading', 'discussions'],
    template: '<div class="discussion-panel">{{ heading }}|{{ discussions.length }}</div>',
  },
}))

vi.mock('@/components/chat/MasteringChatSidebar.vue', () => ({
  default: {
    methods: {
      openPanel() {},
      handleDiscussionEvent() {},
    },
    template: '<div class="mastering-chat-sidebar" />',
  },
}))

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: ref(false),
    downloadProgress: ref(0),
    downloadTrackAudio: mocks.downloadTrackAudioMock,
    downloadAudioAsset: mocks.downloadAudioAssetMock,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/composables/useTrackWebSocket', () => ({
  useTrackWebSocket: () => ({
    connected: ref(false),
  }),
}))

import MasteringView from './MasteringView.vue'

function makeTrackDetail(overrides: Record<string, unknown> = {}) {
  const trackOverrides = (overrides.track as Record<string, unknown> | undefined) ?? {}
  const { track: _ignoredTrack, ...detailOverrides } = overrides
  return {
    track: {
      id: 9,
      album_id: 5,
      title: 'Master Track',
      artist: 'Nova',
      status: 'mastering',
      workflow_variant: 'standard',
      version: 1,
      workflow_cycle: 1,
      file_path: '/source.wav',
      duration: null,
      bpm: null,
      original_title: null,
      original_artist: null,
      author_notes: null,
      mastering_notes: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      archived_at: null,
      submitter_id: 2,
      peer_reviewer_id: null,
      producer_id: 8,
      mastering_engineer_id: 2,
      allowed_actions: ['confirm_delivery'],
      is_public: false,
      workflow_step: {
        id: 'mastering',
        label: 'Mastering',
        type: 'delivery',
        ui_variant: 'mastering',
        assignee_role: 'mastering_engineer',
        order: 0,
        transitions: { request_revision: 'mastering_revision', deliver: 'final_review' },
        require_confirmation: true,
      },
      workflow_transitions: [{ decision: 'request_revision', label: 'Request Revision' }],
      current_source_version: {
        id: 11,
        workflow_cycle: 1,
        version_number: 1,
        file_path: '/source.wav',
        duration: null,
        uploaded_by_id: 2,
        revision_notes: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      current_master_delivery: {
        id: 21,
        workflow_cycle: 1,
        delivery_number: 1,
        file_path: '/master.wav',
        uploaded_by_id: 2,
        confirmed_at: null,
        producer_approved_at: null,
        submitter_approved_at: null,
        created_at: '2024-01-02T00:00:00Z',
      },
      ...trackOverrides,
    },
    issues: [],
    master_deliveries: [
      {
        id: 21,
        workflow_cycle: 1,
        delivery_number: 1,
        file_path: '/master.wav',
        uploaded_by_id: 2,
        confirmed_at: null,
        producer_approved_at: null,
        submitter_approved_at: null,
        created_at: '2024-01-02T00:00:00Z',
      },
    ],
    workflow_config: null,
    source_versions: [
      {
        id: 11,
        workflow_cycle: 1,
        version_number: 1,
        file_path: '/source.wav',
        duration: null,
        uploaded_by_id: 2,
        revision_notes: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    ...detailOverrides,
  }
}

async function openDeliveryTab(wrapper: ReturnType<typeof mountWithPlugins>) {
  const deliveryTab = wrapper.findAll('button').find(button => button.text() === 'Delivery')
  expect(deliveryTab).toBeTruthy()
  await deliveryTab!.trigger('click')
  await flushPromises()
}

describe('MasteringView', () => {
  beforeEach(() => {
    mocks.route = { params: { id: '9' }, query: {}, path: '/tracks/9/mastering', fullPath: '/tracks/9/mastering' }
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
    mocks.updateMasteringNotesMock.mockReset()
    mocks.uploadMasterDeliveryMock.mockReset()
    mocks.approveFinalReviewMock.mockReset()
    mocks.confirmDeliveryMock.mockReset()
    mocks.workflowTransitionMock.mockReset()
    mocks.issueUpdateMock.mockReset()
    mocks.setCurrentTrackMock.mockReset()
    mocks.downloadTrackAudioMock.mockReset()
    mocks.downloadAudioAssetMock.mockReset()
    mocks.waveformPlayFromMock.mockReset()
    mocks.waveformTogglePlayMock.mockReset()
    mocks.currentUser.id = 2
    mocks.listAssignmentsMock.mockResolvedValue([])
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail())
    mocks.updateMasteringNotesMock.mockResolvedValue({ mastering_notes: null })
    mocks.uploadMasterDeliveryMock.mockResolvedValue({})
    mocks.approveFinalReviewMock.mockResolvedValue({})
    mocks.confirmDeliveryMock.mockResolvedValue({})
    mocks.workflowTransitionMock.mockResolvedValue({})
    mocks.issueUpdateMock.mockResolvedValue({})
  })

  it('does not show final approval before the track reaches final review when submitter and mastering engineer are the same user', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail())

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    expect(wrapper.text()).toContain('Confirm My Upload')
    expect(wrapper.text()).not.toContain('Approve Delivery')
  })

  it('opens on the discussion tab and renders mastering communication inline', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      discussions: [
        {
          id: 301,
          track_id: 9,
          author_id: 8,
          phase: 'mastering',
          visibility: 'public',
          content: 'Please keep the top end smooth.',
          created_at: '2024-01-03T00:00:00Z',
          edited_at: null,
          author: { id: 8, display_name: 'Producer', avatar_color: '#123456' },
          images: [],
          audios: [],
        },
      ],
    }))

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()

    expect(wrapper.find('.discussion-panel').text()).toContain('Mastering Communication (1)|1')
  })

  it('restores the requested mastering issue drawer from the route query', async () => {
    mocks.route = {
      params: { id: '9' },
      query: { issue: '77' },
      path: '/tracks/9/mastering',
      fullPath: '/tracks/9/mastering?issue=77',
    }
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      issues: [
        {
          id: 77,
          track_id: 9,
          author_id: 2,
          phase: 'mastering',
          workflow_cycle: 1,
          source_version_id: 11,
          source_version_number: 1,
          master_delivery_id: null,
          title: 'Ease the transient',
          description: 'The snare transient is a bit too sharp.',
          severity: 'minor',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 0,
        },
      ],
    }))

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()

    expect(wrapper.find('.issue-drawer').text()).toContain('Ease the transient|open')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })

  it('shows final approval for the submitter after the confirmed delivery enters final review', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        status: 'final_review',
        workflow_step: {
          id: 'final_review',
          label: 'Final Review',
          type: 'approval',
          ui_variant: 'final_review',
          assignee_role: 'producer',
          order: 1,
          transitions: { reject_to_mastering: 'mastering' },
        },
        workflow_transitions: [{ decision: 'reject_to_mastering', label: 'Return to Mastering' }],
        allowed_actions: ['approve_final'],
        current_master_delivery: {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 2,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-02T00:00:00Z',
        },
      },
      master_deliveries: [
        {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 2,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
    }))

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    expect(wrapper.text()).toContain('Approve Delivery')
    expect(wrapper.text()).not.toContain('Confirm My Upload')
  })

  it('lets the drawer audition final-review issues through the master waveform on the listen tab', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        status: 'final_review',
        workflow_step: {
          id: 'final_review',
          label: 'Final Review',
          type: 'approval',
          ui_variant: 'final_review',
          assignee_role: 'producer',
          order: 1,
          transitions: { reject_to_mastering: 'mastering' },
        },
        workflow_transitions: [{ decision: 'reject_to_mastering', label: 'Return to Mastering' }],
        current_master_delivery: {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 2,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-02T00:00:00Z',
        },
      },
      issues: [
        {
          id: 81,
          track_id: 9,
          author_id: 8,
          phase: 'final_review',
          workflow_cycle: 1,
          source_version_id: 11,
          source_version_number: 1,
          master_delivery_id: 21,
          title: 'Trim the outro',
          description: 'The outro can end a touch earlier.',
          severity: 'minor',
          status: 'open',
          markers: [
            { id: 701, issue_id: 81, marker_type: 'point', time_start: 12.5, time_end: null },
          ],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 0,
        },
      ],
      master_deliveries: [
        {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 2,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
    }))

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()

    const listenTab = wrapper.findAll('button').find(button => button.text() === 'Listen')
    expect(listenTab).toBeTruthy()
    await listenTab!.trigger('click')
    await flushPromises()

    await wrapper.find('.issue-list-item').trigger('click')
    await flushPromises()

    expect(wrapper.find('.issue-drawer').text()).toContain('preview:95')
    expect(wrapper.find('.issue-drawer').text()).toContain('playing:0')
    expect(wrapper.find('.issue-drawer').text()).toContain('marker:-')

    await wrapper.find('.drawer-preview-toggle').trigger('click')
    expect(mocks.waveformPlayFromMock).toHaveBeenNthCalledWith(1, 12.5)

    await wrapper.find('.drawer-preview-play').trigger('click')
    expect(mocks.waveformPlayFromMock).toHaveBeenNthCalledWith(2, 18.25)
  })

  it('allows a submitter-assigned delivery step to confirm and upload from the mastering page', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        mastering_engineer_id: 7,
        workflow_step: {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'submitter',
          order: 0,
          transitions: { request_revision: 'mastering_revision', deliver: 'final_review' },
          require_confirmation: true,
        },
      },
    }))

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    expect(wrapper.text()).toContain('Upload Master Delivery')
    expect(wrapper.text()).toContain('Confirm My Upload')
  })

  it('returns to track detail when delivery confirmation hands off the next step to someone else', async () => {
    mocks.currentUser.id = 7
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        submitter_id: 4,
        mastering_engineer_id: 7,
        producer_id: 8,
        workflow_step: {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'mastering_engineer',
          order: 0,
          transitions: { request_revision: 'mastering_revision', deliver: 'final_review' },
          require_confirmation: true,
        },
      },
    }))
    mocks.confirmDeliveryMock.mockResolvedValue({
      id: 9,
      status: 'final_review',
      submitter_id: 4,
      producer_id: 8,
      mastering_engineer_id: 7,
      workflow_step: {
        id: 'final_review',
        label: 'Final Review',
        type: 'approval',
        ui_variant: 'final_review',
        assignee_role: 'producer',
        order: 1,
        transitions: { reject_to_mastering: 'mastering' },
      },
      current_master_delivery: {
        id: 21,
        confirmed_at: '2024-01-02T12:00:00Z',
        producer_approved_at: null,
        submitter_approved_at: null,
      },
    })

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    await wrapper.findAll('button').find(button => button.text() === 'Confirm My Upload')!.trigger('click')
    await flushPromises()

    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/9')
  })

  it('keeps the mastering workspace open when the same user can continue into final review', async () => {
    mocks.currentUser.id = 2
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        submitter_id: 2,
        mastering_engineer_id: 2,
        producer_id: 8,
        workflow_step: {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'mastering_engineer',
          order: 0,
          transitions: { request_revision: 'mastering_revision', deliver: 'final_review' },
          require_confirmation: true,
        },
      },
    }))
    mocks.confirmDeliveryMock.mockResolvedValue({
      id: 9,
      status: 'final_review',
      submitter_id: 2,
      producer_id: 8,
      mastering_engineer_id: 2,
      workflow_step: {
        id: 'final_review',
        label: 'Final Review',
        type: 'approval',
        ui_variant: 'final_review',
        assignee_role: 'producer',
        order: 1,
        transitions: { reject_to_mastering: 'mastering' },
      },
      current_master_delivery: {
        id: 21,
        confirmed_at: '2024-01-02T12:00:00Z',
        producer_approved_at: null,
        submitter_approved_at: null,
      },
    })

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    await wrapper.findAll('button').find(button => button.text() === 'Confirm My Upload')!.trigger('click')
    await flushPromises()

    expect(mocks.pushMock).not.toHaveBeenCalled()
    expect(mocks.trackGetMock).toHaveBeenCalledTimes(2)
  })

  it('returns to track detail when final approval completes the track', async () => {
    mocks.currentUser.id = 8
    mocks.trackGetMock.mockResolvedValue(makeTrackDetail({
      track: {
        submitter_id: 4,
        mastering_engineer_id: 7,
        producer_id: 8,
        status: 'final_review',
        workflow_step: {
          id: 'final_review',
          label: 'Final Review',
          type: 'approval',
          ui_variant: 'final_review',
          assignee_role: 'producer',
          order: 1,
          transitions: { reject_to_mastering: 'mastering' },
        },
        current_master_delivery: {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 7,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: '2024-01-02T13:00:00Z',
          created_at: '2024-01-02T00:00:00Z',
        },
      },
      master_deliveries: [
        {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          uploaded_by_id: 7,
          confirmed_at: '2024-01-02T12:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: '2024-01-02T13:00:00Z',
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
    }))
    mocks.approveFinalReviewMock.mockResolvedValue({
      id: 9,
      status: 'completed',
      submitter_id: 4,
      producer_id: 8,
      mastering_engineer_id: 7,
      workflow_step: null,
      current_master_delivery: {
        id: 21,
        confirmed_at: '2024-01-02T12:00:00Z',
        producer_approved_at: '2024-01-02T14:00:00Z',
        submitter_approved_at: '2024-01-02T13:00:00Z',
      },
    })

    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await openDeliveryTab(wrapper)

    await wrapper.findAll('button').find(button => button.text() === 'Approve Delivery')!.trigger('click')
    await flushPromises()

    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/9')
  })
})
