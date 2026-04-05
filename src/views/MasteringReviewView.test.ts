import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  requestMasteringRevisionMock: vi.fn(),
  uploadMasterDeliveryMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '6' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  trackApi: {
    get: mocks.trackGetMock,
    requestMasteringRevision: mocks.requestMasteringRevisionMock,
    uploadMasterDelivery: mocks.uploadMasterDeliveryMock,
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

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: { value: false },
    downloadTrackAudio: vi.fn(),
  }),
}))

import MasteringReviewView from './MasteringReviewView.vue'

describe('MasteringReviewView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.requestMasteringRevisionMock.mockReset()
    mocks.uploadMasterDeliveryMock.mockReset()
    mocks.requestMasteringRevisionMock.mockResolvedValue({})
    mocks.uploadMasterDeliveryMock.mockResolvedValue({})
  })

  it('loads and filters issues for current mastering cycle', async () => {
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 6, title: 'Track 6', status: 'mastering', workflow_cycle: 2, file_path: '/audio.wav' },
      issues: [
        { id: 1, phase: 'mastering', workflow_cycle: 2, time_start: 1 },
        { id: 2, phase: 'mastering', workflow_cycle: 1, time_start: 2 },
        { id: 3, phase: 'peer', workflow_cycle: 2, time_start: 3 },
      ],
      checklist_items: [],
      events: [],
    })

    const wrapper = mountWithPlugins(MasteringReviewView)
    await Promise.resolve()
    await Promise.resolve()

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
    await Promise.resolve()
    await Promise.resolve()

    // The "Request Revision" button is btn-secondary text-sm w-full
    const revisionBtn = wrapper.findAll('button.btn-secondary').find(b => b.classes().includes('w-full'))
    expect(revisionBtn).toBeTruthy()
    await revisionBtn!.trigger('click')
    await Promise.resolve()
    await Promise.resolve()
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
    await Promise.resolve()
    await Promise.resolve()

    // Select master file
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['master'], 'master.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    // Find upload button — it's the last button
    const buttons = wrapper.findAll('button')
    const uploadBtn = buttons[buttons.length - 1]
    expect(uploadBtn.exists()).toBe(true)
    await uploadBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.uploadMasterDeliveryMock).toHaveBeenCalledWith(6, file)
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
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('My Song')
  })
})
