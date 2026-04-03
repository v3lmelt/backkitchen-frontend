import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  issueCreateMock: vi.fn(),
  checklistSubmitMock: vi.fn(),
  finishPeerReviewMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  trackApi: { get: mocks.trackGetMock, finishPeerReview: mocks.finishPeerReviewMock },
  issueApi: { create: mocks.issueCreateMock },
  checklistApi: { submit: mocks.checklistSubmitMock },
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

import PeerReviewView from './PeerReviewView.vue'

describe('PeerReviewView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.issueCreateMock.mockReset()
    mocks.checklistSubmitMock.mockReset()
    mocks.finishPeerReviewMock.mockReset()
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 7, title: 'Track 7', version: 2, workflow_cycle: 2, file_path: '/audio.wav' },
      issues: [
        { id: 1, phase: 'peer', workflow_cycle: 2, time_start: 1.1 },
        { id: 2, phase: 'peer', workflow_cycle: 1, time_start: 5.2 },
        { id: 3, phase: 'mastering', workflow_cycle: 2, time_start: 9.9 },
      ],
      checklist_items: [],
      events: [],
    })
    mocks.issueCreateMock.mockResolvedValue({ id: 11, phase: 'peer', workflow_cycle: 2, time_start: 1.3 })
    mocks.checklistSubmitMock.mockResolvedValue([{ id: 99, label: 'Balance', passed: true, note: null }])
    mocks.finishPeerReviewMock.mockResolvedValue({})
  })

  it('filters issues to current peer review cycle and submits new issue', async () => {
    const wrapper = mountWithPlugins(PeerReviewView)
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.find('.issue-list').text()).toBe('1')

    await wrapper.find('button.btn-primary').trigger('click')
    const titleInput = wrapper.find('input')
    await titleInput.setValue('Clicks')
    await wrapper.find('textarea').setValue('Need cleanup')
    await wrapper.findAll('button').find(button => button.text() === 'common.submitIssue')?.trigger('click')

    expect(mocks.issueCreateMock).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Clicks' }))
  })

  it('submits checklist and finishes review', async () => {
    const wrapper = mountWithPlugins(PeerReviewView)
    await Promise.resolve()
    await Promise.resolve()

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text() === 'peerReview.saveChecklist')!.trigger('click')
    await buttons.find(button => button.text() === 'peerReview.passToProducer')!.trigger('click')

    expect(mocks.checklistSubmitMock).toHaveBeenCalledWith(7, expect.any(Array))
    expect(mocks.finishPeerReviewMock).toHaveBeenCalledWith(7, 'pass')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/7')
  })
})
