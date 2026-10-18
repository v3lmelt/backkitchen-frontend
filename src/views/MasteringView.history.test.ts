import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { mountWithPlugins } from '@/tests/utils'
import { historyDetail, historyIssue, historyMaster } from '@/tests/issueHistoryFixtures'
import type { Issue, MasterDelivery, TrackSourceVersion } from '@/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), update: vi.fn(), batch: vi.fn(),
  route: { params: { id: '9' }, query: {} as Record<string, string>, path: '/tracks/9/mastering' },
  reload: undefined as (() => Promise<void>) | undefined }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: (route: { query?: Record<string, string> }) => { mocks.route.query = route.query ?? {} } }) }))
vi.mock('@/api', () => ({
  trackApi: { get: mocks.get, listAssignments: vi.fn().mockResolvedValue([]) },
  issueApi: { get: vi.fn(async (id: number) => historyIssue({ id })), create: mocks.create, update: mocks.update, batchUpdate: mocks.batch },
  discussionApi: { list: vi.fn().mockResolvedValue([]) }, commentApi: {}, r2Api: {}, uploadToR2: vi.fn(),
  resolveAssetUrl: (url: string) => url,
  trackAudioUrl: (trackId: number, number: number) => `/api/tracks/${trackId}/audio?v=${number}`,
  sourceVersionAudioUrl: (trackId: number, version: TrackSourceVersion) => `/api/tracks/${trackId}/source-versions/${version.id}/audio?v=${version.version_number}&c=${version.workflow_cycle}&t=${encodeURIComponent(version.created_at)}`,
  masterDeliveryAudioUrl: (trackId: number, delivery: MasterDelivery) => `/api/tracks/${trackId}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}&t=${encodeURIComponent(delivery.created_at)}`,
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ currentUser: { id: 2 }, r2Enabled: false }) }))
vi.mock('@/stores/tracks', () => ({ useTrackStore: () => ({ setCurrentTrack: vi.fn() }) }))
vi.mock('@/composables/useTrackWebSocket', () => ({ useTrackWebSocket: (_id: unknown, reload: () => Promise<void>) => {
  mocks.reload = reload
  return { connected: ref(false), reconnectAttempts: ref(0), retry: vi.fn() }
} }))
vi.mock('@/components/audio/WaveformPlayer.vue', () => ({ default: {
  props: ['audioUrl', 'issues', 'compareIssues', 'compareAudioUrl', 'selectable', 'mode'],
  template: '<div class="history-waveform" :data-url="audioUrl" :data-compare="compareAudioUrl || \'none\'" :data-issues="issues?.map(issue => issue.id).join(\',\')" :data-compare-issues="compareIssues?.map(issue => issue.id).join(\',\')" :data-selectable="selectable" />',
} }))
vi.mock('@/components/common/CustomSelect.vue', () => ({ default: {
  props: ['options', 'modelValue'], emits: ['update:modelValue'],
  template: '<select class="history-select" :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="option in options" :value="option.value">{{ option.label }}</option></select>',
} }))
vi.mock('@/components/common/DiscussionPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/chat/MasteringChatSidebar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/IssueDetailPanel.vue', () => ({ default: { props: ['issue'], template: '<div class="history-drawer">{{ issue?.title }}:{{ issue?.status }}</div>' } }))
vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({ default: { template: '<div />' } }))

import MasteringView from './MasteringView.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'

function issues(): Issue[] {
  return [historyIssue(), historyIssue({ id: 2, local_number: 2, title: 'Old critical', source_version_id: 11, source_version_number: 1,
    workflow_cycle: 1, severity: 'critical', phase: 'custom_review' }),
    historyIssue({ id: 3, local_number: 3, title: 'Old pending', workflow_cycle: 1, source_version_id: 11, status: 'pending_discussion' }),
    historyIssue({ id: 4, local_number: 4, title: 'Old disagreement', workflow_cycle: 1, source_version_id: null,
      source_version_number: null, status: 'disagreed' }),
    historyIssue({ id: 5, local_number: 5, title: 'Old closed', workflow_cycle: 1, source_version_id: 11, status: 'resolved' }),
    historyIssue({ id: 6, local_number: 6, title: 'Old internal closed', workflow_cycle: 1, source_version_id: 11, status: 'internal_resolved' }),
    historyIssue({ id: 7, local_number: 7, title: 'Old master', workflow_cycle: 1, source_version_id: null, source_version_number: null,
      master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1, severity: 'minor' })]
}
async function openIssues() {
  const wrapper = mountWithPlugins(MasteringView)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Issues')!.trigger('click')
  await flushPromises()
  return wrapper
}

describe('Mastering historical issue behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear()
    mocks.route = reactive({ params: { id: '9' }, query: {}, path: '/tracks/9/mastering' })
    mocks.get.mockResolvedValue(historyDetail(issues()))
    mocks.create.mockResolvedValue(historyIssue({ id: 8, local_number: 8, title: 'New current issue', markers: [] }))
  })

  it('keeps every visible unresolved cycle and custom phase prominent while both closed states fold', async () => {
    const wrapper = await openIssues()
    expect(wrapper.findAll('[data-issue-id]').map(row => row.attributes('data-issue-id'))).toEqual(['2', '1', '3', '4', '7'])
    for (const id of [2, 3, 4, 7]) expect(wrapper.get(`[data-issue-id="${id}"]`).classes()).not.toContain('opacity-60')
    expect(wrapper.text()).toContain('Resolved · 2')
    expect(wrapper.text()).not.toContain('Old closed')
    expect(wrapper.text()).not.toContain('Old internal closed')
    expect(wrapper.get('.history-waveform').attributes('data-url')).toBe('/api/tracks/9/source-versions/13/audio?v=3&c=2&t=2026-10-02T00%3A00%3A00Z')
    expect(wrapper.get('.history-waveform').attributes('data-issues')).toBe('1')
    expect(wrapper.text()).toContain('Cycle 1 · Master v1')
    await wrapper.findAll('button').find(button => button.text().includes('Resolved · 2'))!.trigger('click')
    expect(wrapper.text()).toContain('Old closed')
    expect(wrapper.text()).toContain('Old internal closed')
    wrapper.unmount()
  })

  it('keeps the explicit version filter independent from selected comparison and preserves the shared player', async () => {
    const wrapper = await openIssues()
    const sourceElement = wrapper.get('.history-waveform').element
    await wrapper.findAll('button').find(button => button.text() === 'Listen')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Compare Versions')!.trigger('click')
    await wrapper.find('.history-select').setValue('11')
    await wrapper.findAll('button').find(button => button.text() === 'Issues')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.history-waveform').element).toBe(sourceElement)
    expect(wrapper.get('.history-waveform').attributes('data-compare')).toContain('/source-versions/11/audio?v=1&c=1&t=')
    expect(wrapper.get('.history-waveform').attributes('data-issues')).toBe('1')
    expect(wrapper.get('.history-waveform').attributes('data-compare-issues')).toBe('2,3,5,6')
    expect(wrapper.text()).toContain('Old critical')
    expect(wrapper.text()).toContain('Old disagreement')
    expect(wrapper.get('button.btn-primary.text-xs').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('New issues use: current source v3')
    await wrapper.findAll('button').find(button => button.text() === 'Current version')!.trigger('click')
    expect(wrapper.findAll('[data-issue-id]').map(row => row.attributes('data-issue-id'))).toEqual(['1'])
    expect(wrapper.get('.history-waveform').attributes('data-compare')).toContain('/source-versions/11/audio?v=1&c=1&t=')
    wrapper.unmount()
  })

  it('creates against the current source then restores all versions and focuses the new issue', async () => {
    const pending = Promise.withResolvers<Issue>()
    mocks.create.mockReturnValueOnce(pending.promise)
    const wrapper = await openIssues()
    await wrapper.findAll('button').find(button => button.text() === 'Current version')!.trigger('click')
    await wrapper.get('button.btn-primary.text-xs').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'General Issue')!.trigger('click')
    await wrapper.get('input:not([type="file"])').setValue('New current issue')
    await wrapper.get('textarea').setValue('New current description')
    await wrapper.findAll('button').find(button => button.classes().includes('btn-primary') && button.classes().includes('text-sm'))!.trigger('click')
    const view = wrapper.vm as unknown as { selectedCompareSourceVersionId: number | null }
    view.selectedCompareSourceVersionId = 11
    await wrapper.vm.$nextTick()
    pending.resolve(historyIssue({ id: 8, local_number: 8, title: 'New current issue', markers: [] }))
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'New current issue', markers: [] }), expect.any(Function))
    expect(wrapper.findAll('button').find(button => button.text() === 'All versions')!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Old critical')
    expect(wrapper.get('[data-issue-id="8"]').classes()).toContain('!border-primary/70')
    expect(wrapper.get('.history-waveform').attributes('data-compare')).toContain('/source-versions/11/audio?v=1&c=1&t=')
    wrapper.unmount()
  })

  it('prunes hidden folded and filtered batch rows without banning historical mutations', async () => {
    const wrapper = await openIssues()
    await wrapper.get('[data-issue-id="2"] input[type="checkbox"]').trigger('click')
    expect(wrapper.getComponent(BatchIssueActions).props('selectedCount')).toBe(1)
    await wrapper.findAll('button').find(button => button.text() === 'Current version')!.trigger('click')
    expect(wrapper.getComponent(BatchIssueActions).props('selectedCount')).toBe(0)
    await wrapper.findAll('button').find(button => button.text() === 'All versions')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('Resolved · 2'))!.trigger('click')
    await wrapper.get('[data-issue-id="5"] input[type="checkbox"]').trigger('click')
    expect(wrapper.getComponent(BatchIssueActions).props('selectedCount')).toBe(1)
    await wrapper.findAll('button').find(button => button.text().includes('Resolved · 2'))!.trigger('click')
    expect(wrapper.getComponent(BatchIssueActions).props('selectedCount')).toBe(0)
    mocks.update.mockResolvedValue({ ...issues()[1], status: 'resolved' })
    const row = wrapper.get('[data-issue-id="2"]')
    await row.findAll('button').find(button => button.text() === 'Mark Resolved')!.trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, { status: 'resolved' })
    expect(wrapper.text()).toContain('Resolved · 3')
    wrapper.unmount()
  })

  it('opens old-cycle deep links and does not reuse a stale selection after websocket removal', async () => {
    mocks.route.query = { issue: '2' }
    const wrapper = await openIssues()
    expect(wrapper.get('.history-drawer').text()).toBe('Old critical:open')
    mocks.get.mockResolvedValue(historyDetail(issues().filter(issue => issue.id !== 2)))
    await mocks.reload?.()
    await flushPromises()
    expect(wrapper.get('.history-drawer').text()).toBe(':')
    expect(wrapper.text()).not.toContain('Old critical')
    wrapper.unmount()
  })

  it('matches the actual master fallback cycle rather than current workflow cycle', async () => {
    mocks.get.mockResolvedValue(historyDetail(issues(), { current_master_delivery: historyMaster(21, 1) }))
    const wrapper = mountWithPlugins(MasteringView)
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Listen')!.trigger('click')
    expect(wrapper.findAll('.history-waveform')[1].attributes('data-url')).toBe('/api/tracks/9/master-deliveries/21/audio?v=1&c=1&t=2026-10-02T00%3A00%3A00Z')
    expect(wrapper.findAll('.history-waveform')[1].attributes('data-issues')).toBe('7')
    wrapper.unmount()
  })

  it('keeps ambiguous same-cycle legacy timed issues out of current markers and current-version membership', async () => {
    mocks.get.mockResolvedValueOnce(historyDetail([
      historyIssue(),
      historyIssue({ id: 8, title: 'Unknown legacy timing', source_version_id: null, source_version_number: null }),
      historyIssue({ id: 9, title: 'Unbound general context', source_version_id: null, source_version_number: null, markers: [] }),
    ]))
    const wrapper = await openIssues()
    expect(wrapper.get('.history-waveform').attributes('data-issues')).toBe('1')
    expect(wrapper.text()).toContain('Unknown legacy timing')
    await wrapper.findAll('button').find(button => button.text() === 'Current version')!.trigger('click')
    expect(wrapper.findAll('[data-issue-id]').map(row => row.attributes('data-issue-id'))).toEqual(['1', '9'])
    expect(wrapper.text()).not.toContain('Unknown legacy timing')
    expect(wrapper.text()).toContain('Unbound general context')
    wrapper.unmount()
  })
})
