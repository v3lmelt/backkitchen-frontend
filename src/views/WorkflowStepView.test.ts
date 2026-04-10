import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  workflowTransitionMock: vi.fn(),
  approveFinalReviewMock: vi.fn(),
  confirmDeliveryMock: vi.fn(),
  downloadTrackAudioMock: vi.fn(),
  downloadAudioAssetMock: vi.fn(),
  appStore: {
    currentUser: { id: 1 },
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '9', stepId: 'intake' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  checklistApi: {
    getTemplate: vi.fn(),
    submit: vi.fn(),
  },
  trackApi: {
    get: mocks.trackGetMock,
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
  default: { template: '<div class="waveform" />' },
}))

vi.mock('@/components/audio/IssueMarkerList.vue', () => ({
  default: {
    props: ['issues'],
    template: '<div class="issue-list">{{ issues.length }}</div>',
  },
}))

vi.mock('@/components/IssueCreatePanel.vue', () => ({
  default: {
    template: '<div class="issue-create" />',
  },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    template: '<div class="compare-select" />',
  },
}))

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: { value: false },
    downloadProgress: { value: 0 },
    downloadTrackAudio: mocks.downloadTrackAudioMock,
    downloadAudioAsset: mocks.downloadAudioAssetMock,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
  }),
}))

import WorkflowStepView from './WorkflowStepView.vue'

describe('WorkflowStepView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.workflowTransitionMock.mockReset()
    mocks.approveFinalReviewMock.mockReset()
    mocks.confirmDeliveryMock.mockReset()
    mocks.downloadTrackAudioMock.mockReset()
    mocks.downloadAudioAssetMock.mockReset()
    mocks.workflowTransitionMock.mockResolvedValue({})
    mocks.approveFinalReviewMock.mockResolvedValue({})
    mocks.confirmDeliveryMock.mockResolvedValue({})
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
    expect(wrapper.text()).toContain('Accept')
    expect(wrapper.text()).toContain('Return to Peer Review')

    const approveButton = wrapper.findAll('button').find(button => button.text() === 'Accept')
    expect(approveButton).toBeTruthy()

    await approveButton!.trigger('click')
    await flushPromises()

    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'accept')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/9')
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

    await downloadButtons[1].trigger('click')
    expect(mocks.downloadAudioAssetMock).toHaveBeenCalledWith(
      '/api/tracks/9/master-deliveries/21/audio?v=2&c=1',
      'Master Track_master_v2_cycle1',
      '/master-v2.wav',
    )
  })
})
