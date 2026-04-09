import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

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
  API_ORIGIN: '',
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

vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({
  default: {
    props: ['actions'],
    template: '<div class="workflow-actions"><button v-for="action in actions" :key="action.label" class="workflow-action" :disabled="action.disabled" @click="action.handler()">{{ action.label }}</button></div>',
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
        { id: 1, phase: 'peer', workflow_cycle: 2, markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 1.1, time_end: null }] },
        { id: 2, phase: 'peer', workflow_cycle: 1, markers: [{ id: 2, issue_id: 2, marker_type: 'point', time_start: 5.2, time_end: null }] },
        { id: 3, phase: 'mastering', workflow_cycle: 2, markers: [{ id: 3, issue_id: 3, marker_type: 'point', time_start: 9.9, time_end: null }] },
      ],
      checklist_items: [],
      events: [],
    })
    mocks.issueCreateMock.mockResolvedValue({ id: 11, phase: 'peer', workflow_cycle: 2, markers: [{ id: 11, issue_id: 11, marker_type: 'point', time_start: 1.3, time_end: null }] })
    mocks.checklistSubmitMock.mockResolvedValue([{ id: 99, label: 'Balance', passed: true, note: null }])
    mocks.finishPeerReviewMock.mockResolvedValue({})
  })

  it('filters issues to current peer review cycle and submits new issue', async () => {
    const wrapper = mountWithPlugins(PeerReviewView)
    await flushPromises()

    expect(wrapper.find('.issue-list').text()).toBe('1')

    await wrapper.find('button.btn-primary').trigger('click')
    const titleInput = wrapper.find('input.input-field')
    await titleInput.setValue('Clicks')
    await wrapper.find('textarea').setValue('Need cleanup')
    await wrapper.findAll('button').find(button => button.text() === 'Submit Issue')?.trigger('click')
    await flushPromises()

    expect(mocks.issueCreateMock).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Clicks' }))
  })

  it('submits checklist and finishes review', async () => {
    const wrapper = mountWithPlugins(PeerReviewView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text() === 'Save Checklist')!.trigger('click')
    await wrapper.findAll('button.workflow-action').find(button => button.text() === 'Pass to Producer')!.trigger('click')
    await flushPromises()

    expect(mocks.checklistSubmitMock).toHaveBeenCalledWith(7, expect.any(Array))
    expect(mocks.finishPeerReviewMock).toHaveBeenCalledWith(7, 'pass')
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/7')
  })
})
