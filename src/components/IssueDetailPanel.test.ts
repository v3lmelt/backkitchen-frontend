import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import { historyDetail, historyIssue } from '@/tests/issueHistoryFixtures'
import type { Issue, MasterDelivery, TrackSourceVersion } from '@/types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), play: vi.fn(), seek: vi.fn(), pause: vi.fn(), failedUrl: '' }))
vi.mock('@/api', () => ({
  API_ORIGIN: '', getAuthToken: () => 'test-token',
  issueApi: { get: mocks.get }, commentApi: {}, r2Api: {}, uploadToR2: vi.fn(),
  resolveAssetUrl: (url: string) => url,
  sourceVersionAudioUrl: (trackId: number, version: TrackSourceVersion) => `/api/tracks/${trackId}/source-versions/${version.id}/audio?v=${version.version_number}&c=${version.workflow_cycle}&t=${encodeURIComponent(version.created_at)}`,
  masterDeliveryAudioUrl: (trackId: number, delivery: MasterDelivery) => `/api/tracks/${trackId}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}&t=${encodeURIComponent(delivery.created_at)}`,
  trackAudioUrl: (trackId: number, number: number) => `/api/tracks/${trackId}/audio?v=${number}`,
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ currentUser: { id: 2 }, r2Enabled: false }) }))

interface PreviewWaveform {
  audioUrl: string
  $emit: (name: string, ...args: unknown[]) => void
}
vi.mock('@/components/audio/WaveformPlayer.vue', () => ({ default: {
  name: 'WaveformPlayer', props: ['audioUrl'], emits: ['ready', 'timeupdate', 'playbackStateChange', 'load-error'],
  mounted(this: PreviewWaveform) {
    if (this.audioUrl === mocks.failedUrl) this.$emit('load-error', { audioUrl: this.audioUrl, side: 'A', error: new Error('403') })
    else this.$emit('ready', 4)
  },
  methods: {
    playFrom(this: PreviewWaveform, time: number) { mocks.play(this.audioUrl, time); this.$emit('timeupdate', time); this.$emit('playbackStateChange', true) },
    seekTo(this: PreviewWaveform, time: number) { mocks.seek(this.audioUrl, time); this.$emit('timeupdate', time) },
    togglePlay(this: PreviewWaveform) { mocks.pause(this.audioUrl); this.$emit('playbackStateChange', false) },
    exportPeaks() { return [0.2, 0.6, 0.4] },
  }, template: '<div class="original-decoder" :data-url="audioUrl" />',
} }))
vi.mock('@/components/common/CommentInput.vue', () => ({ default: {
  template: '<div />', methods: { reset() {} },
} }))
const oldSourceUrl = '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=2026-10-02T00%3A00%3A00Z'
const oldMasterUrl = '/api/tracks/9/master-deliveries/21/audio?v=1&c=1&t=2026-10-02T00%3A00%3A00Z'

import IssueDetailPanel from './IssueDetailPanel.vue'

function issueWithComment(overrides: Partial<Issue> = {}): Issue {
  return historyIssue({ workflow_cycle: 1, source_version_id: 11, source_version_number: 1,
    title: 'Historical unresolved', comments: [{ id: 21, issue_id: 1, author_id: 3, content: 'Keep this original comment at t:00:02',
      visibility: 'public', is_status_note: false, created_at: '2026-10-01T00:00:00Z' }], ...overrides })
}
function mountPanel(issue: Issue) {
  mocks.get.mockResolvedValue(issue)
  const detail = historyDetail([issue])
  return mountWithPlugins(IssueDetailPanel, { props: { issue, track: detail.track, sourceVersions: detail.source_versions, masterDeliveries: detail.master_deliveries },
    global: { stubs: { teleport: true } } })
}

describe('IssueDetailPanel original audio', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.failedUrl = ''; localStorage.clear() })

  it('auditions the exact historical source independently using real preview and timestamp controls', async () => {
    const wrapper = mountPanel(issueWithComment())
    await flushPromises()
    expect(wrapper.text()).toContain('Source v1')
    expect(wrapper.get('.original-decoder').attributes('data-url')).toBe(oldSourceUrl)
    await wrapper.get('.issue-preview-toggle').trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenCalledWith(oldSourceUrl, 1)
    await wrapper.findAll('button').find(button => button.text() === 't:00:02')!.trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenLastCalledWith(oldSourceUrl, 2)
    expect(wrapper.emitted('preview-play-at')).toBeUndefined()
    expect(wrapper.emitted('preview-action')).toBeUndefined()
    expect(wrapper.text()).toContain('Keep this original comment')
    wrapper.unmount()
  })

  it('prioritizes an exact historical master binding over phase and source metadata', async () => {
    const wrapper = mountPanel(issueWithComment({ phase: 'custom_master_review', master_delivery_id: 21,
      master_delivery_number: 1, master_delivery_workflow_cycle: 1 }))
    await flushPromises()
    expect(wrapper.text()).toContain('Cycle 1 · Master v1')
    expect(wrapper.get('.original-decoder').attributes('data-url')).toBe(oldMasterUrl)
    await wrapper.get('.issue-preview-marker-hit').trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenCalledWith(oldMasterUrl, 1)
    wrapper.unmount()
  })

  it('retains issue text, comments and timestamp context when protected history returns 403', async () => {
    mocks.failedUrl = oldMasterUrl
    const wrapper = mountPanel(issueWithComment({ master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 }))
    await flushPromises()
    expect(wrapper.text()).toContain('Cycle 1 · Master v1')
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.text()).toContain('Original description')
    expect(wrapper.text()).toContain('Keep this original comment')
    expect(wrapper.text()).toContain('0:01.0')
    expect(wrapper.find('.issue-playback-preview').exists()).toBe(false)
    expect(wrapper.find('.original-decoder').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === 't:00:02')!.trigger('click')
    expect(mocks.play).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each(['expired', 'external', 'missing'] as const)('keeps %s source context without a current-audio fallback', async (kind) => {
    const issue = issueWithComment()
    const detail = historyDetail([issue])
    if (kind === 'missing') detail.source_versions = detail.source_versions?.filter(source => source.id !== 11)
    else detail.source_versions = detail.source_versions?.map(source => source.id === 11
      ? { ...source, file_path: null, source_kind: kind === 'external' ? 'external_link' : 'file' } : source)
    mocks.get.mockResolvedValue(issue)
    const wrapper = mountWithPlugins(IssueDetailPanel, { props: { issue, track: detail.track, sourceVersions: detail.source_versions, masterDeliveries: detail.master_deliveries },
      global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.text()).toContain('Keep this original comment')
    expect(wrapper.find('.original-decoder').exists()).toBe(false)
    expect(mocks.play).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('allows original-audio timestamps and full playback for general issues without markers', async () => {
    const wrapper = mountPanel(issueWithComment({ markers: [] }))
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 't:00:01')!.trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenLastCalledWith(oldSourceUrl, 1)
    await wrapper.get('.issue-preview-toggle').trigger('click')
    await flushPromises()
    expect(mocks.pause).toHaveBeenCalledWith(oldSourceUrl)
    await wrapper.get('.issue-preview-toggle').trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenLastCalledWith(oldSourceUrl, 0)
    wrapper.unmount()
  })

  it('ignores stale detail responses after another issue opens and clears playback on close', async () => {
    const pending = Promise.withResolvers<Issue>()
    const first = issueWithComment()
    mocks.get.mockReturnValueOnce(pending.promise)
    const detail = historyDetail([first])
    const wrapper = mountWithPlugins(IssueDetailPanel, { props: { issue: first, track: detail.track, sourceVersions: detail.source_versions, masterDeliveries: detail.master_deliveries },
      global: { stubs: { teleport: true } } })
    const second = issueWithComment({ id: 2, title: 'New selection', source_version_id: 13, source_version_number: 3 })
    mocks.get.mockResolvedValueOnce(second)
    await wrapper.setProps({ issue: second })
    pending.resolve(first)
    await flushPromises()
    expect(wrapper.text()).toContain('New selection')
    expect(wrapper.text()).not.toContain('Historical unresolved')
    expect(wrapper.get('.original-decoder').attributes('data-url')).toBe('/api/tracks/9/source-versions/13/audio?v=3&c=2&t=2026-10-02T00%3A00%3A00Z')
    await wrapper.setProps({ issue: null })
    await flushPromises()
    expect(wrapper.find('.original-decoder').exists()).toBe(false)
    wrapper.unmount()
  })

  it('withdraws already loaded historical master playback when the audio capability is denied', async () => {
    const issue = issueWithComment({ master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 })
    const wrapper = mountPanel(issue)
    await flushPromises()
    await wrapper.get('.issue-preview-toggle').trigger('click')
    await flushPromises()
    expect(mocks.play).toHaveBeenCalledWith(oldMasterUrl, 1)
    await wrapper.setProps({ track: { ...historyDetail().track, viewer_can_access_master_audio: false } })
    await flushPromises()
    expect(wrapper.find('.original-decoder').exists()).toBe(false)
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.text()).toContain('Keep this original comment')
    const previousCalls = mocks.play.mock.calls.length
    await wrapper.findAll('button').find(button => button.text() === 't:00:02')!.trigger('click')
    expect(mocks.play).toHaveBeenCalledTimes(previousCalls)
    wrapper.unmount()
  })

  it('preserves same-cycle legacy timing context without guessing current audio after revisions', async () => {
    const wrapper = mountPanel(issueWithComment({ workflow_cycle: 2, source_version_id: null, source_version_number: null }))
    await flushPromises()
    expect(wrapper.find('.original-decoder').exists()).toBe(false)
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.text()).toContain('0:01.0')
    expect(wrapper.text()).toContain('Keep this original comment')
    await wrapper.findAll('button').find(button => button.text() === 't:00:02')!.trigger('click')
    expect(mocks.play).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
