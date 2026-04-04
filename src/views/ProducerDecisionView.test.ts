import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  trackApi: {
    get: mocks.trackGetMock,
    intakeDecision: mocks.intakeDecisionMock,
    producerGate: mocks.producerGateMock,
  },
  issueApi: { create: vi.fn() },
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
    await Promise.resolve()
    await Promise.resolve()

    // Should show accept button
    const buttons = wrapper.findAll('button')
    const acceptBtn = buttons.find(b => b.classes().includes('btn-primary') && b.text().length > 0)
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
    await Promise.resolve()
    await Promise.resolve()

    const acceptBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && !b.classes().includes('text-xs'))
    expect(acceptBtn).toBeTruthy()
    await acceptBtn!.trigger('click')
    await Promise.resolve()
    expect(mocks.intakeDecisionMock).toHaveBeenCalledWith(5, 'accept')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/5')
  })

  it('shows gate actions for producer_mastering_gate track', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'producer_mastering_gate', workflow_cycle: 1, file_path: '/audio.wav' },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 1, status: 'open', title: 'I1', severity: 'major', time_start: 1 },
      ],
      checklist_items: [{ id: 1, label: 'Balance', passed: true, note: null }],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await Promise.resolve()
    await Promise.resolve()

    // Should show send to mastering and request revision buttons
    const buttons = wrapper.findAll('button')
    const hasMasteringBtn = buttons.some(b => b.classes().includes('btn-primary'))
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
    await Promise.resolve()
    await Promise.resolve()

    // Find send to mastering button (btn-primary in grid)
    const primaryBtns = wrapper.findAll('button.btn-primary')
    const sendBtn = primaryBtns.find(b => b.text().length > 0 && !b.classes().includes('text-xs'))
    expect(sendBtn).toBeTruthy()
    await sendBtn!.trigger('click')
    await Promise.resolve()
    expect(mocks.producerGateMock).toHaveBeenCalledWith(5, 'send_to_mastering')
  })

  it('displays issue counts', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 5, title: 'Track 5', status: 'producer_mastering_gate', workflow_cycle: 1, file_path: '/a.wav' },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 1, status: 'open', title: 'I', severity: 'major', time_start: 1 },
        { id: 2, phase: 'peer', workflow_cycle: 1, status: 'resolved', title: 'I2', severity: 'minor', time_start: 2 },
      ],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(ProducerDecisionView)
    await Promise.resolve()
    await Promise.resolve()

    // Total issues = 2, open = 1, resolved = 1
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('1')
  })
})
