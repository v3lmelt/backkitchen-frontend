import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  issueCreateMock: vi.fn(),
  approveFinalReviewMock: vi.fn(),
  returnToMasteringMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '10' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: {
    get: mocks.trackGetMock,
    approveFinalReview: mocks.approveFinalReviewMock,
    returnToMastering: mocks.returnToMasteringMock,
  },
  issueApi: { create: mocks.issueCreateMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: { id: 2 },
  }),
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

import FinalReviewView from './FinalReviewView.vue'

describe('FinalReviewView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.issueCreateMock.mockReset()
    mocks.approveFinalReviewMock.mockReset()
    mocks.returnToMasteringMock.mockReset()
    mocks.trackGetMock.mockResolvedValue({
      track: {
        id: 10,
        title: 'Track 10',
        producer_id: 2,
        submitter_id: 3,
        current_master_delivery: { id: 55, producer_approved_at: null, submitter_approved_at: null },
      },
      issues: [
        { id: 1, phase: 'final_review', master_delivery_id: 55, time_start: 1 },
        { id: 2, phase: 'final_review', master_delivery_id: 44, time_start: 2 },
      ],
      checklist_items: [],
      events: [],
    })
    mocks.issueCreateMock.mockResolvedValue({ id: 99, phase: 'final_review', master_delivery_id: 55, time_start: 1 })
    mocks.approveFinalReviewMock.mockResolvedValue({})
    mocks.returnToMasteringMock.mockResolvedValue({})
  })

  it('filters issues to the current master delivery and approves', async () => {
    const wrapper = mountWithPlugins(FinalReviewView)
    await flushPromises()

    expect(wrapper.find('.issue-list').text()).toBe('1')
    await wrapper.findAll('button.workflow-action').find(button => button.text() === 'Approve Current Master')!.trigger('click')
    await flushPromises()

    expect(mocks.approveFinalReviewMock).toHaveBeenCalledWith(10)
    expect(mocks.trackGetMock).toHaveBeenCalledTimes(2)
  })

  it('returns to mastering when issues exist', async () => {
    const wrapper = mountWithPlugins(FinalReviewView)
    await flushPromises()

    await wrapper.findAll('button.workflow-action').find(button => button.text() === 'Return to Mastering')!.trigger('click')
    await flushPromises()

    expect(mocks.returnToMasteringMock).toHaveBeenCalledWith(10)
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/10')
  })
})
