import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { mountWithPlugins } from '@/tests/utils'
import { historyDetail, historyIssue, historyMaster, historySource } from '@/tests/issueHistoryFixtures'
import type { MasterDelivery, TrackSourceVersion } from '@/types'

const mocks = vi.hoisted(() => ({ getIssue: vi.fn(), list: vi.fn(), getTrack: vi.fn(), failedUrl: '', play: vi.fn(),
  route: { params: { id: '1' }, path: '/issues/1', query: {} } }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/api', () => ({ issueApi: { get: mocks.getIssue, listForTrack: mocks.list }, commentApi: {},
  API_ORIGIN: '', getAuthToken: () => 'test-token',
  trackApi: { get: mocks.getTrack, listAssignments: vi.fn().mockResolvedValue([]) }, r2Api: {}, uploadToR2: vi.fn(),
  resolveAssetUrl: (url: string) => url,
  sourceVersionAudioUrl: (trackId: number, version: TrackSourceVersion) => `/api/tracks/${trackId}/source-versions/${version.id}/audio?v=${version.version_number}&c=${version.workflow_cycle}&t=${encodeURIComponent(version.created_at)}`,
  masterDeliveryAudioUrl: (trackId: number, delivery: MasterDelivery) => `/api/tracks/${trackId}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}&t=${encodeURIComponent(delivery.created_at)}`,
  trackAudioUrl: (trackId: number, number: number) => `/api/tracks/${trackId}/audio?v=${number}`,
}))
interface LegacyWaveform { audioUrl: string; $emit: (name: string, ...args: unknown[]) => void }
vi.mock('@/components/audio/WaveformPlayer.vue', () => ({ default: {
  props: ['audioUrl'], emits: ['ready', 'load-error'],
  mounted(this: LegacyWaveform) {
    if (this.audioUrl === mocks.failedUrl) this.$emit('load-error', { audioUrl: this.audioUrl, side: 'A', error: new Error('403') })
    else this.$emit('ready', 4)
  },
  methods: { seekTo() {}, focusIssue() {}, highlightIssue() {}, playFrom(this: LegacyWaveform, time: number) { mocks.play(this.audioUrl, time) } },
  template: '<div class="legacy-original" :data-url="audioUrl" />',
} }))
vi.mock('@/components/common/CommentInput.vue', () => ({ default: { template: '<div />', methods: { reset() {} } } }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ currentUser: { id: 2 }, r2Enabled: false }) }))
vi.mock('@/stores/tracks', () => ({ useTrackStore: () => ({ currentTrack: null, setCurrentTrack: vi.fn() }) }))
import IssueDetailView from './IssueDetailView.vue'
const oldSourceUrl = '/api/tracks/9/source-versions/11/audio?v=1&c=1&t=2026-10-02T00%3A00%3A00Z'

function legacyIssue() {
  return historyIssue({ workflow_cycle: 1, source_version_id: 11, source_version_number: 1,
    comments: [{ id: 21, issue_id: 1, author_id: 3, content: 'Legacy comment with t:00:02', visibility: 'public',
      is_status_note: false, created_at: '2026-10-01T00:00:00Z' }] })
}

describe('legacy issue detail original audio', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.clearAllMocks(); localStorage.clear(); mocks.failedUrl = ''
    mocks.route = reactive({ params: { id: '1' }, path: '/issues/1', query: {} })
  })

  it('resolves source audio by exact source ID even when the reported version number equals current', async () => {
    const issue = { ...legacyIssue(), source_version_number: 3 }
    mocks.getIssue.mockResolvedValue(issue)
    mocks.list.mockResolvedValue([issue])
    mocks.getTrack.mockResolvedValue(historyDetail([issue]))
    const wrapper = mountWithPlugins(IssueDetailView)
    await flushPromises()
    expect(wrapper.get('.legacy-original').attributes('data-url')).toBe(oldSourceUrl)
    expect(wrapper.text()).toContain('Source v1')
    await wrapper.findAll('button').find(button => button.text() === 't:00:02')!.trigger('click')
    expect(mocks.play).toHaveBeenCalledWith(oldSourceUrl, 2)
    wrapper.unmount()
  })

  it('preserves historical master text and comments on denied audio instead of playing current master', async () => {
    const issue = { ...legacyIssue(), master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 }
    mocks.getIssue.mockResolvedValue(issue)
    mocks.list.mockResolvedValue([issue])
    mocks.getTrack.mockResolvedValue(historyDetail([issue]))
    mocks.failedUrl = '/api/tracks/9/master-deliveries/21/audio?v=1&c=1&t=2026-10-02T00%3A00%3A00Z'
    const wrapper = mountWithPlugins(IssueDetailView)
    await flushPromises()
    expect(wrapper.text()).toContain('Cycle 1 · Master v1')
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.text()).toContain('Original description')
    expect(wrapper.text()).toContain('Legacy comment')
    expect(wrapper.find('.legacy-original').exists()).toBe(false)
    expect(mocks.play).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not mount a player for a retained expired source record', async () => {
    const issue = legacyIssue()
    const detail = historyDetail([issue])
    detail.source_versions = detail.source_versions?.map(source => source.id === 11 ? { ...source, file_path: null } : source)
    mocks.getIssue.mockResolvedValue(issue)
    mocks.list.mockResolvedValue([issue])
    mocks.getTrack.mockResolvedValue(detail)
    const wrapper = mountWithPlugins(IssueDetailView)
    await flushPromises()
    expect(wrapper.text()).toContain('Source v1')
    expect(wrapper.text()).toContain('Legacy comment')
    expect(wrapper.text()).toContain('Original audio is unavailable or access is denied')
    expect(wrapper.find('.legacy-original').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['source', 'master'] as const)('refreshes same-track metadata for a newly bound %s record when navigating to another issue', async (kind) => {
    const first = legacyIssue()
    const source = historySource(14, 4)
    const master = historyMaster(23, 2, 2)
    const next = historyIssue({ id: 2, title: 'Newly bound issue',
      ...(kind === 'source' ? { source_version_id: source.id, source_version_number: source.version_number }
        : { master_delivery_id: master.id, master_delivery_number: master.delivery_number, master_delivery_workflow_cycle: master.workflow_cycle }),
    })
    const initial = historyDetail([first])
    const refreshed = historyDetail([first, next], kind === 'source'
      ? { current_source_version: source, version: 4, file_path: source.file_path }
      : { current_master_delivery: master })
    if (kind === 'source') refreshed.source_versions = [...(refreshed.source_versions ?? []), source]
    else refreshed.master_deliveries = [...(refreshed.master_deliveries ?? []), master]
    mocks.getIssue.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
    mocks.list.mockResolvedValueOnce([first]).mockResolvedValueOnce([first, next])
    mocks.getTrack.mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed)
    const wrapper = mountWithPlugins(IssueDetailView)
    await flushPromises()
    mocks.route.params.id = '2'
    await flushPromises()
    expect(mocks.getTrack).toHaveBeenCalledTimes(2)
    const path = kind === 'source' ? '/source-versions/14/audio?v=4' : '/master-deliveries/23/audio?v=2'
    expect(wrapper.get('.legacy-original').attributes('data-url')).toBe(`/api/tracks/9${path}&c=2&t=2026-10-02T00%3A00%3A00Z`)
    expect(wrapper.text()).toContain('Newly bound issue')
    expect(wrapper.text()).not.toContain('Original audio is unavailable or access is denied')
    wrapper.unmount()
  })
})
