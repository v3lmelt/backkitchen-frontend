import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  requestMasteringRevisionMock: vi.fn(),
  uploadWithProgressMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '6' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    requestMasteringRevision: mocks.requestMasteringRevisionMock,
  },
  uploadWithProgress: mocks.uploadWithProgressMock,
  r2Api: {},
  uploadToR2: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ r2Enabled: false }),
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

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: { value: false },
    downloadTrackAudio: vi.fn(),
  }),
}))

vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({
  default: {
    props: ['actions'],
    template: '<div class="workflow-actions"><button v-for="action in actions" :key="action.label" class="workflow-action" :disabled="action.disabled" @click="action.handler()">{{ action.label }}</button></div>',
  },
}))

import MasteringReviewView from './MasteringReviewView.vue'

describe('MasteringReviewView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.requestMasteringRevisionMock.mockReset()
    mocks.uploadWithProgressMock.mockReset()
    mocks.requestMasteringRevisionMock.mockResolvedValue({})
    mocks.uploadWithProgressMock.mockResolvedValue({})
  })

  it('loads and filters issues for current mastering cycle', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 6, title: 'Track 6', status: 'mastering', workflow_cycle: 2, file_path: '/audio.wav' },
      issues: [
        { id: 1, phase: 'mastering', workflow_cycle: 2, markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 1, time_end: null }] },
        { id: 2, phase: 'mastering', workflow_cycle: 1, markers: [{ id: 2, issue_id: 2, marker_type: 'point', time_start: 2, time_end: null }] },
        { id: 3, phase: 'peer', workflow_cycle: 2, markers: [{ id: 3, issue_id: 3, marker_type: 'point', time_start: 3, time_end: null }] },
      ],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(MasteringReviewView)
    await flushPromises()

    // Should only show 1 mastering issue from cycle 2
    expect(wrapper.find('.issue-list').text()).toBe('1')
  })

  it('calls requestMasteringRevision and redirects', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 6, title: 'Track 6', status: 'mastering', workflow_cycle: 1, file_path: '/audio.wav' },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(MasteringReviewView)
    await flushPromises()

    const revisionBtn = wrapper.findAll('button.workflow-action').find(button => button.text() === 'Request Source Revision')
    expect(revisionBtn).toBeTruthy()
    await revisionBtn!.trigger('click')
    await flushPromises()
    expect(mocks.requestMasteringRevisionMock).toHaveBeenCalledWith(6)
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/6')
  })

  it('uploads master delivery file and redirects', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 6, title: 'Track 6', status: 'mastering', workflow_cycle: 1, file_path: '/audio.wav' },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(MasteringReviewView)
    await flushPromises()

    // Select master file
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['master'], 'master.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    const uploadBtn = wrapper.findAll('button.workflow-action').find(button => button.text() === 'Upload Master Delivery')
    expect(uploadBtn).toBeTruthy()
    if (!uploadBtn) throw new Error('Upload action button not found')
    await uploadBtn.trigger('click')
    await flushPromises()

    expect(mocks.uploadWithProgressMock).toHaveBeenCalledWith('/tracks/6/master-deliveries', expect.any(FormData), expect.any(Function))
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/6')
  })

  it('shows heading with track title', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 6, title: 'My Song', status: 'mastering', workflow_cycle: 1, file_path: '/a.wav' },
      issues: [],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(MasteringReviewView)
    await flushPromises()

    expect(wrapper.text()).toContain('My Song')
  })
})
