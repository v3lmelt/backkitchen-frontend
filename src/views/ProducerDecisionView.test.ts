import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  intakeDecisionMock: vi.fn(),
  producerGateMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    intakeDecision: mocks.intakeDecisionMock,
    producerGate: mocks.producerGateMock,
  },
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
    props: ['trackId', 'phase'],
    template: '<div class="issue-create" />',
    setup() { return { selectedRange: null, handleClick: vi.fn(), handleRangeSelect: vi.fn() } },
  },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<span class="badge" />' },
}))

vi.mock('@/components/workflow/WorkflowProgress.vue', () => ({
  default: { template: '<div class="progress" />' },
}))

vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({
  default: {
    props: ['actions'],
    template: '<div class="workflow-actions"><button v-for="action in actions" :key="action.label" class="workflow-action" @click="action.handler()">{{ action.label }}</button></div>',
  },
}))

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: { value: false },
    downloadTrackAudio: vi.fn(),
  }),
}))

import ProducerDecisionView from './ProducerDecisionView.vue'

describe('ProducerDecisionView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.intakeDecisionMock.mockReset()
    mocks.producerGateMock.mockReset()
    mocks.intakeDecisionMock.mockResolvedValue({})
    mocks.producerGateMock.mockResolvedValue({})
  })

  it('shows intake actions for submitted track', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'submitted', workflow_cycle: 1 },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await flushPromises()

    const acceptBtn = wrapper.findAll('button.workflow-action').find(button => button.text() === 'Accept and Assign Review')
    expect(acceptBtn).toBeTruthy()
  })

  it('calls intakeDecision on accept', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'submitted', workflow_cycle: 1 },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await flushPromises()

    const acceptBtn = wrapper.findAll('button.workflow-action').find(button => button.text() === 'Accept and Assign Review')
    expect(acceptBtn).toBeTruthy()
    await acceptBtn!.trigger('click')
    await flushPromises()
    expect(mocks.intakeDecisionMock).toHaveBeenCalledWith(5, 'accept')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/5')
  })

  it('shows gate actions for producer_mastering_gate track', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'producer_mastering_gate', workflow_cycle: 1, file_path: '/audio.wav' },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 1, status: 'open', title: 'I1', severity: 'major', markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 1, time_end: null }] },
      ],
      checklist_items: [{ id: 1, label: 'Balance', passed: true, note: null }],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await flushPromises()

    const hasMasteringBtn = wrapper.findAll('button.workflow-action').some(button => button.text() === 'Send to Mastering')
    expect(hasMasteringBtn).toBe(true)
  })

  it('calls producerGate for send_to_mastering', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'producer_mastering_gate', workflow_cycle: 1, file_path: '/audio.wav' },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await flushPromises()

    const sendBtn = wrapper.findAll('button.workflow-action').find(button => button.text() === 'Send to Mastering')
    expect(sendBtn).toBeTruthy()
    await sendBtn!.trigger('click')
    await flushPromises()
    expect(mocks.producerGateMock).toHaveBeenCalledWith(5, 'send_to_mastering')
  })

  it('displays issue counts', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'producer_mastering_gate', workflow_cycle: 1, file_path: '/a.wav' },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 1, status: 'open', title: 'I', severity: 'major', markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 1, time_end: null }] },
        { id: 2, phase: 'peer', workflow_cycle: 1, status: 'resolved', title: 'I2', severity: 'minor', markers: [{ id: 2, issue_id: 2, marker_type: 'point', time_start: 2, time_end: null }] },
      ],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await flushPromises()

    // Total issues = 2, open = 1, resolved = 1
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('1')
  })
})
