import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  route: {
    params: { id: '9', stepId: 'intake' },
    query: {} as Record<string, string>,
    path: '/tracks/9/step/intake',
    fullPath: '/tracks/9/step/intake',
  },
  trackGetMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
  issueUpdateMock: vi.fn(),
  workflowTransitionMock: vi.fn(),
  approveFinalReviewMock: vi.fn(),
  confirmDeliveryMock: vi.fn(),
  checklistGetTemplateMock: vi.fn(),
  checklistSubmitMock: vi.fn(),
  downloadTrackAudioMock: vi.fn(),
  downloadAudioAssetMock: vi.fn(),
  appStore: {
    currentUser: { id: 1 },
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  checklistApi: {
    getTemplate: mocks.checklistGetTemplateMock,
    submit: mocks.checklistSubmitMock,
  },
  issueApi: {
    update: mocks.issueUpdateMock,
  },
  trackApi: {
    get: mocks.trackGetMock,
    listAssignments: mocks.listAssignmentsMock,
    workflowTransition: mocks.workflowTransitionMock,
    approveFinalReview: mocks.approveFinalReviewMock,
    confirmDelivery: mocks.confirmDeliveryMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => mocks.appStore,
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<div class="status-badge" />' },
}))

vi.mock('@/components/workflow/WorkflowProgress.vue', () => ({
  default: { template: '<div class="workflow-progress" />' },
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
    emits: ['select', 'status-change'],
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
        <button
          v-for="issue in issues"
          :key="'resolve-' + issue.id"
          class="issue-quick-resolve"
          @click="$emit('status-change', { issue, status: 'resolved' })"
        >
          resolve {{ issue.id }}
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
    props: ['issue'],
    emits: ['close', 'updated'],
    template: '<div v-if="issue" class="peer-issue-drawer">{{ issue.title }}|{{ issue.status }}</div>',
  },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<button class="compare-select" @click="$emit(\'update:modelValue\', options?.[0]?.value ?? null)">{{ modelValue ?? "none" }}</button>',
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

import WorkflowStepView from './WorkflowStepView.vue'

describe('WorkflowStepView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.route = {
      params: { id: '9', stepId: 'intake' },
      query: {},
      path: '/tracks/9/step/intake',
      fullPath: '/tracks/9/step/intake',
    }
    mocks.trackGetMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
    mocks.issueUpdateMock.mockReset()
    mocks.workflowTransitionMock.mockReset()
    mocks.approveFinalReviewMock.mockReset()
    mocks.confirmDeliveryMock.mockReset()
    mocks.checklistGetTemplateMock.mockReset()
    mocks.checklistSubmitMock.mockReset()
    mocks.downloadTrackAudioMock.mockReset()
    mocks.downloadAudioAssetMock.mockReset()
    mocks.workflowTransitionMock.mockResolvedValue({})
    mocks.listAssignmentsMock.mockResolvedValue([])
    mocks.issueUpdateMock.mockImplementation(async (id: number, data: { status?: string }) => ({ id, status: data.status ?? 'open' }))
    mocks.approveFinalReviewMock.mockResolvedValue({})
    mocks.confirmDeliveryMock.mockResolvedValue({})
    mocks.checklistSubmitMock.mockResolvedValue([])
  })

  it('renders approval step actions and routes transitions through the generic endpoint', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: {
        id: 9,
        title: 'Approval Track',
        artist: 'Nova',
        status: 'intake',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        workflow_step: {
          id: 'intake',
          label: 'Intake',
          type: 'approval',
          ui_variant: 'intake',
          assignee_role: 'producer',
          order: 0,
          transitions: { accept: 'peer_review', reject_to_peer_review: 'peer_review' },
        },
        workflow_transitions: [
          { decision: 'accept', label: 'Accept' },
          { decision: 'reject_to_peer_review', label: 'Reject To Peer Review' },
        ],
      },
      issues: [],
      checklist_items: [],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'intake', label: 'Intake', type: 'approval', ui_variant: 'intake', assignee_role: 'producer', order: 0, transitions: { accept: 'peer_review', reject_to_peer_review: 'peer_review' } },
          { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', order: 1, transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    expect(wrapper.find('.workflow-progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('Return to Peer Review')
    expect(wrapper.text()).toContain('Send to Peer Review')

    const approveButton = wrapper.findAll('button').find(button => button.text() === 'Send to Peer Review')
    expect(approveButton).toBeTruthy()

    await approveButton!.trigger('click')
    await flushPromises()

    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'accept')
    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/9',
      query: { returnTo: '/tracks/9/step/intake' },
    })
  })

  it('keeps only the dedicated final-review approval action', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Final Track',
        artist: 'Nova',
        status: 'final_review',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        producer_id: 1,
        submitter_id: 2,
        mastering_engineer_id: 3,
        current_master_delivery: {
          id: 11,
          file_path: '/master.wav',
          producer_approved_at: null,
          submitter_approved_at: null,
          confirmed_at: '2024-01-01T00:00:00Z',
        },
        workflow_step: {
          id: 'final_review',
          label: 'Final Review',
          type: 'approval',
          ui_variant: 'final_review',
          assignee_role: 'producer',
          order: 0,
          transitions: { reject_to_mastering: 'mastering' },
        },
        workflow_transitions: [
          { decision: 'approve', label: 'Approve' },
          { decision: 'reject_to_mastering', label: 'Return to Mastering' },
        ],
      },
      issues: [
        { id: 1, phase: 'final_review', workflow_cycle: 1, master_delivery_id: 11, title: 'Fix ending' },
      ],
      checklist_items: [],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 0, transitions: {} },
          { id: 'final_review', label: 'Final Review', type: 'approval', ui_variant: 'final_review', assignee_role: 'producer', order: 1, transitions: { reject_to_mastering: 'mastering' } },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    expect(buttons.filter(button => button.text() === 'Approve').length).toBe(0)
    expect(buttons.some(button => button.text() === 'Approve Current Master')).toBe(true)
    expect(buttons.some(button => button.text() === 'Return to Mastering')).toBe(true)
  })

  it('shows master delivery history with compare and per-version download actions', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Master Track',
        artist: 'Nova',
        status: 'mastering',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 2,
        mastering_engineer_id: 1,
        current_master_delivery: {
          id: 22,
          workflow_cycle: 2,
          delivery_number: 3,
          file_path: '/master-v3.wav',
          confirmed_at: '2024-01-03T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-03T00:00:00Z',
        },
        workflow_step: {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'mastering_engineer',
          order: 1,
          transitions: { deliver: 'final_review' },
        },
        workflow_transitions: [
          { decision: 'deliver', label: 'Deliver' },
        ],
      },
      issues: [],
      checklist_items: [],
      master_deliveries: [
        {
          id: 22,
          workflow_cycle: 2,
          delivery_number: 3,
          file_path: '/master-v3.wav',
          confirmed_at: '2024-01-03T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-03T00:00:00Z',
        },
        {
          id: 21,
          workflow_cycle: 1,
          delivery_number: 2,
          file_path: '/master-v2.wav',
          confirmed_at: '2024-01-02T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'mastering', label: 'Mastering', type: 'delivery', ui_variant: 'mastering', assignee_role: 'mastering_engineer', order: 1, transitions: { deliver: 'final_review' } },
          { id: 'final_review', label: 'Final Review', type: 'approval', ui_variant: 'final_review', assignee_role: 'producer', order: 2, transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    const compareButton = wrapper.findAll('button').find(button => button.text().includes('Compare'))
    expect(compareButton).toBeTruthy()

    await compareButton!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.compare-select').exists()).toBe(true)

    const downloadButtons = wrapper.findAll('button').filter(button => button.text().includes('Download Audio'))
    expect(downloadButtons.length).toBeGreaterThan(1)

    await downloadButtons[downloadButtons.length - 1].trigger('click')
    expect(mocks.downloadAudioAssetMock).toHaveBeenCalledWith(
      '/api/tracks/9/master-deliveries/21/audio?v=2&c=1',
      'Master Track_master_v2_history_202401020000',
      '/master-v2.wav',
    )
  })

  it('omits the confirm delivery action when the delivery step does not require confirmation', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Direct Delivery Track',
        artist: 'Nova',
        status: 'mastering',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        mastering_engineer_id: 1,
        current_master_delivery: {
          id: 31,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          confirmed_at: null,
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-03T00:00:00Z',
        },
        workflow_step: {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'mastering_engineer',
          order: 1,
          require_confirmation: false,
          transitions: { deliver: 'final_review' },
        },
        workflow_transitions: [
          { decision: 'deliver', label: 'Deliver' },
        ],
      },
      issues: [],
      checklist_items: [],
      master_deliveries: [
        {
          id: 31,
          workflow_cycle: 1,
          delivery_number: 1,
          file_path: '/master.wav',
          confirmed_at: null,
          producer_approved_at: null,
          submitter_approved_at: null,
          created_at: '2024-01-03T00:00:00Z',
        },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'mastering', label: 'Mastering', type: 'delivery', ui_variant: 'mastering', assignee_role: 'mastering_engineer', order: 1, require_confirmation: false, transitions: { deliver: 'final_review' } },
          { id: 'final_review', label: 'Final Review', type: 'approval', ui_variant: 'final_review', assignee_role: 'producer', order: 2, transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    expect(wrapper.find('.workflow-action-bar').text()).toContain('Deliver')
    expect(wrapper.find('.workflow-action-bar').text()).not.toContain('Confirm Delivery')
  })

  it('auto-saves peer review notes before transitioning', async () => {
    mocks.checklistGetTemplateMock.mockResolvedValue({
      items: [{ label: 'Balance', required: true, sort_order: 0 }],
      is_default: false,
    })
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Peer Track',
        artist: 'Nova',
        album_id: 3,
        status: 'peer_review',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        workflow_step: {
          id: 'peer_review',
          label: 'Peer Review',
          type: 'review',
          ui_variant: 'peer_review',
          assignee_role: 'peer_reviewer',
          order: 1,
          transitions: { pass: 'producer_gate' },
        },
        workflow_transitions: [
          { decision: 'pass', label: 'Pass' },
        ],
      },
      issues: [],
      checklist_items: [
        {
          id: 41,
          track_id: 9,
          reviewer_id: 1,
          source_version_id: 101,
          workflow_cycle: 1,
          label: 'Balance',
          passed: true,
          note: 'old note',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'peer_review', label: 'Peer Review', type: 'review', ui_variant: 'peer_review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: 'producer_gate' } },
          { id: 'producer_gate', label: 'Producer Gate', type: 'gate', ui_variant: 'producer_gate', assignee_role: 'producer', order: 2, transitions: {} },
        ],
      },
    })
    mocks.checklistSubmitMock.mockResolvedValueOnce([
      {
        id: 41,
        track_id: 9,
        reviewer_id: 1,
        source_version_id: 101,
        workflow_cycle: 1,
        label: 'Balance',
        passed: true,
        note: 'updated note',
        created_at: '2024-01-01T00:00:00Z',
      },
    ])

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('updated note')
    await flushPromises()

    const passButton = wrapper.findAll('button').find(button => button.text().includes('Pass'))
    expect(passButton).toBeTruthy()

    await passButton!.trigger('click')
    await flushPromises()

    expect(mocks.checklistSubmitMock).toHaveBeenCalledWith(9, [
      { label: 'Balance', passed: true, note: 'updated note' },
    ])
    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'pass')
  })

  it('supports read-only source compare during peer review', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Peer Track',
        artist: 'Nova',
        status: 'peer_review',
        file_path: '/audio.wav',
        version: 3,
        workflow_cycle: 2,
        current_source_version: { id: 301 },
        workflow_step: {
          id: 'peer_review',
          label: 'Peer Review',
          type: 'review',
          ui_variant: 'peer_review',
          assignee_role: 'peer_reviewer',
          order: 1,
          transitions: { pass: 'producer_gate' },
        },
        workflow_transitions: [
          { decision: 'pass', label: 'Pass' },
        ],
      },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 2, source_version_number: 3, title: 'Current peer issue' },
        { id: 2, phase: 'peer', workflow_cycle: 2, source_version_number: 2, title: 'Older peer issue' },
      ],
      checklist_items: [],
      source_versions: [
        { id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' },
        { id: 201, version_number: 2, created_at: '2024-01-02T00:00:00Z' },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'peer_review', label: 'Peer Review', type: 'review', ui_variant: 'peer_review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: 'producer_gate' } },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    const compareButton = wrapper.findAll('button').find(button => button.text().includes('Compare'))
    expect(compareButton).toBeTruthy()

    await compareButton!.trigger('click')
    await flushPromises()

    await wrapper.find('.compare-select').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('workflowStep.sourceCompareReadonlyHint')
    expect(wrapper.find('.waveform').text()).toContain('compare:201')
    expect(wrapper.find('.issue-list').text()).toBe('1')
  })

  it('keeps peer review issue inspection and status updates inside the step page', async () => {
    mocks.route = {
      params: { id: '9', stepId: 'peer_review' },
      query: {},
      path: '/tracks/9/step/peer_review',
      fullPath: '/tracks/9/step/peer_review',
    }
    mocks.issueUpdateMock.mockResolvedValueOnce({
      id: 51,
      track_id: 9,
      author_id: 3,
      phase: 'peer',
      workflow_cycle: 1,
      source_version_id: 101,
      source_version_number: 1,
      master_delivery_id: null,
      title: 'Tame the hats',
      description: 'The hats feel too sharp in the drop.',
      severity: 'major',
      status: 'resolved',
      markers: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      comment_count: 1,
    })
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Peer Track',
        artist: 'Nova',
        status: 'peer_review',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        workflow_step: {
          id: 'peer_review',
          label: 'Peer Review',
          type: 'review',
          ui_variant: 'peer_review',
          assignee_role: 'peer_reviewer',
          order: 1,
          transitions: { pass: 'producer_gate' },
        },
        workflow_transitions: [{ decision: 'pass', label: 'Pass' }],
      },
      issues: [
        {
          id: 51,
          track_id: 9,
          author_id: 3,
          phase: 'peer',
          workflow_cycle: 1,
          source_version_id: 101,
          source_version_number: 1,
          master_delivery_id: null,
          title: 'Tame the hats',
          description: 'The hats feel too sharp in the drop.',
          severity: 'major',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 1,
        },
      ],
      checklist_items: [],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'peer_review', label: 'Peer Review', type: 'review', ui_variant: 'peer_review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: 'producer_gate' } },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    await wrapper.find('.issue-list-item').trigger('click')
    await flushPromises()

    expect(mocks.pushMock).not.toHaveBeenCalled()
    expect(mocks.replaceMock).toHaveBeenCalledWith({
      path: '/tracks/9/step/peer_review',
      query: { issue: '51' },
    })
    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Tame the hats|open')

    await wrapper.find('.issue-quick-resolve').trigger('click')
    await flushPromises()

    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(51, { status: 'resolved' })
    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Tame the hats|resolved')
  })

  it('enables source compare on producer gate too', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Producer Track',
        artist: 'Nova',
        status: 'producer_gate',
        file_path: '/audio.wav',
        version: 4,
        workflow_cycle: 2,
        current_source_version: { id: 401 },
        workflow_step: {
          id: 'producer_gate',
          label: 'Producer Gate',
          type: 'gate',
          ui_variant: 'producer_gate',
          assignee_role: 'producer',
          order: 2,
          transitions: { send_to_mastering: 'mastering' },
        },
        workflow_transitions: [
          { decision: 'send_to_mastering', label: 'Send to Mastering' },
        ],
      },
      issues: [
        { id: 10, phase: 'producer', workflow_cycle: 2, source_version_number: 4, title: 'Current producer issue' },
        { id: 11, phase: 'producer', workflow_cycle: 2, source_version_number: 3, title: 'Older producer issue' },
      ],
      checklist_items: [],
      source_versions: [
        { id: 401, version_number: 4, created_at: '2024-01-04T00:00:00Z' },
        { id: 301, version_number: 3, created_at: '2024-01-03T00:00:00Z' },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'producer_gate', label: 'Producer Gate', type: 'gate', ui_variant: 'producer_gate', assignee_role: 'producer', order: 2, transitions: { send_to_mastering: 'mastering' } },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('Compare'))!.trigger('click')
    await flushPromises()
    await wrapper.find('.compare-select').trigger('click')
    await flushPromises()

    expect(wrapper.find('.waveform').text()).toContain('compare:301')
    expect(wrapper.find('.issue-list').text()).toBe('1')
  })

  it('shows peer-only handoff issues in a drawer and groups producer gate decisions together', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Producer Track',
        artist: 'Nova',
        status: 'producer_gate',
        file_path: '/audio.wav',
        version: 2,
        workflow_cycle: 1,
        current_source_version: { id: 201 },
        workflow_step: {
          id: 'producer_gate',
          label: 'Producer Gate',
          type: 'approval',
          ui_variant: 'producer_gate',
          assignee_role: 'producer',
          order: 2,
          transitions: { approve: 'mastering', reject: 'producer_revision', reject_to_peer_review: 'peer_review' },
        },
        workflow_transitions: [
          { decision: 'approve', label: 'Approve' },
          { decision: 'reject', label: 'Reject' },
          { decision: 'reject_to_peer_review', label: 'Return to Peer Review' },
        ],
      },
      issues: [
        {
          id: 10,
          track_id: 9,
          author_id: 4,
          phase: 'peer',
          workflow_cycle: 1,
          source_version_id: 201,
          source_version_number: 2,
          master_delivery_id: null,
          title: 'Peer balance note',
          description: 'Kick is still too loud in the chorus.',
          severity: 'major',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 2,
        },
        {
          id: 11,
          track_id: 9,
          author_id: 1,
          phase: 'producer',
          workflow_cycle: 1,
          source_version_id: 201,
          source_version_number: 2,
          master_delivery_id: null,
          title: 'Producer-only note',
          description: 'Internal producer note',
          severity: 'minor',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 0,
        },
      ],
      checklist_items: [],
      source_versions: [
        { id: 201, version_number: 2, created_at: '2024-01-02T00:00:00Z' },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', order: 1, transitions: {} },
          { id: 'producer_gate', label: 'Producer Gate', type: 'approval', ui_variant: 'producer_gate', assignee_role: 'producer', order: 2, transitions: { approve: 'mastering', reject: 'producer_revision', reject_to_peer_review: 'peer_review' } },
          { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 3, transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    expect(wrapper.find('.decision-group').exists()).toBe(true)
    expect(wrapper.text()).toContain('Next Decision')
    expect(wrapper.text()).toContain('Send to Mastering')
    expect(wrapper.text()).toContain('Producer Follow-up')
    expect(wrapper.findAll('.peer-issue-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Peer balance note')

    await wrapper.find('.peer-issue-card').trigger('click')
    await flushPromises()

    expect(mocks.pushMock).not.toHaveBeenCalled()
    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Peer balance note')
  })

  it('lets revision snapshots open a drawer and quick-update issue status inline', async () => {
    mocks.issueUpdateMock.mockResolvedValueOnce({
      id: 41,
      track_id: 9,
      author_id: 8,
      phase: 'producer',
      workflow_cycle: 2,
      source_version_id: 301,
      source_version_number: 2,
      master_delivery_id: null,
      title: 'Fix the chorus lift',
      description: 'Need more energy in the chorus.',
      severity: 'major',
      status: 'resolved',
      markers: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
      comment_count: 1,
    })
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Revision Track',
        artist: 'Nova',
        status: 'producer_revision',
        file_path: '/audio.wav',
        version: 3,
        workflow_cycle: 2,
        submitter_id: 1,
        producer_id: 8,
        current_source_version: { id: 401 },
        workflow_step: {
          id: 'producer_revision',
          label: 'Producer Revision',
          type: 'revision',
          assignee_role: 'submitter',
          order: 3,
          return_to: 'producer_gate',
          transitions: {},
        },
        workflow_transitions: [],
      },
      issues: [
        {
          id: 41,
          track_id: 9,
          author_id: 8,
          phase: 'producer',
          workflow_cycle: 2,
          source_version_id: 301,
          source_version_number: 2,
          master_delivery_id: null,
          title: 'Fix the chorus lift',
          description: 'Need more energy in the chorus.',
          severity: 'major',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 1,
        },
      ],
      checklist_items: [],
      source_versions: [
        { id: 401, version_number: 3, created_at: '2024-01-03T00:00:00Z' },
        { id: 301, version_number: 2, created_at: '2024-01-02T00:00:00Z' },
      ],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'producer_gate', label: 'Producer Gate', type: 'gate', ui_variant: 'producer_gate', assignee_role: 'producer', order: 2, transitions: {} },
          { id: 'producer_revision', label: 'Producer Revision', type: 'revision', assignee_role: 'submitter', order: 3, return_to: 'producer_gate', transitions: {} },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    await wrapper.find('.issue-list-item').trigger('click')
    await flushPromises()

    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Fix the chorus lift|open')

    await wrapper.find('.issue-quick-resolve').trigger('click')
    await flushPromises()

    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(41, { status: 'resolved' })
    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Fix the chorus lift|resolved')
  })

  it('reopens the requested final review issue drawer from the route query', async () => {
    mocks.route = {
      params: { id: '9', stepId: 'final_review' },
      query: { issue: '61' },
      path: '/tracks/9/step/final_review',
      fullPath: '/tracks/9/step/final_review?issue=61',
    }
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 9,
        title: 'Final Track',
        artist: 'Nova',
        status: 'final_review',
        file_path: '/audio.wav',
        version: 1,
        workflow_cycle: 1,
        producer_id: 1,
        submitter_id: 2,
        mastering_engineer_id: 3,
        current_master_delivery: {
          id: 11,
          file_path: '/master.wav',
          producer_approved_at: null,
          submitter_approved_at: null,
          confirmed_at: '2024-01-01T00:00:00Z',
        },
        workflow_step: {
          id: 'final_review',
          label: 'Final Review',
          type: 'approval',
          ui_variant: 'final_review',
          assignee_role: 'producer',
          order: 0,
          transitions: { reject_to_mastering: 'mastering' },
        },
        workflow_transitions: [{ decision: 'reject_to_mastering', label: 'Return to Mastering' }],
      },
      issues: [
        {
          id: 61,
          track_id: 9,
          author_id: 3,
          phase: 'final_review',
          workflow_cycle: 1,
          source_version_id: null,
          source_version_number: null,
          master_delivery_id: 11,
          title: 'Loosen the limiter',
          description: 'The outro feels a bit too pinned down.',
          severity: 'minor',
          status: 'open',
          markers: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          comment_count: 0,
        },
      ],
      checklist_items: [],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 0, transitions: {} },
          { id: 'final_review', label: 'Final Review', type: 'approval', ui_variant: 'final_review', assignee_role: 'producer', order: 1, transitions: { reject_to_mastering: 'mastering' } },
        ],
      },
    })

    const wrapper = mountWithPlugins(WorkflowStepView)
    await flushPromises()

    expect(wrapper.find('.peer-issue-drawer').text()).toContain('Loosen the limiter|open')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })
})
