import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

import { mountWithPlugins } from '@/tests/utils'
import type { MasterDelivery, TrackSourceVersion } from '@/types'
import { historySource } from '@/tests/issueHistoryFixtures'

const mocks = vi.hoisted(() => ({
  route: {
    name: 'track-detail',
    path: '/tracks/7',
    fullPath: '/tracks/7',
    params: { id: '7' },
    query: {} as Record<string, string>,
  },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  openMock: vi.fn(),
  trackGetMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
  uploadSourceVersionMock: vi.fn(),
  createSourceFollowupMock: vi.fn(),
  decideSourceFollowupMock: vi.fn(),
  cancelSourceFollowupMock: vi.fn(),
  requestSourceFollowupUploadMock: vi.fn(),
  confirmSourceFollowupUploadMock: vi.fn(),
  uploadToR2Mock: vi.fn(),
  trackReopenMock: vi.fn(),
  trackRequestReopenMock: vi.fn(),
  decideReopenRequestMock: vi.fn(),
  discussionCreateMock: vi.fn(),
  issueUpdateMock: vi.fn(),
  downloadTrackAudioMock: vi.fn(),
  setVisibilityMock: vi.fn(),
  currentUser: { id: 2 },
  waveformPlayFromMock: vi.fn(),
  waveformSeekToMock: vi.fn(),
  waveformTogglePlayMock: vi.fn(),
  waveformExportPeaksMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  AUTH_TOKEN_KEY: 'backkitchen_token',
  AUTH_USER_KEY: 'backkitchen_user',
  getAuthToken: () => localStorage.getItem('backkitchen_token'),
  trackAudioUrl: (trackId: number, v?: number | null) => `/api/tracks/${trackId}/audio?v=${v ?? 0}`,
  masterDeliveryAudioUrl: (trackId: number, delivery: MasterDelivery) => `/api/tracks/${trackId}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}&t=${encodeURIComponent(delivery.created_at)}`,
  sourceVersionAudioUrl: (trackId: number, version: TrackSourceVersion) => `/api/tracks/${trackId}/source-versions/${version.id}/audio?v=${version.version_number}&c=${version.workflow_cycle}&t=${encodeURIComponent(version.created_at)}`,
  trackApi: {
    get: mocks.trackGetMock,
    listAssignments: mocks.listAssignmentsMock,
    uploadSourceVersion: mocks.uploadSourceVersionMock,
    createSourceFollowup: mocks.createSourceFollowupMock,
    decideSourceFollowup: mocks.decideSourceFollowupMock,
    cancelSourceFollowup: mocks.cancelSourceFollowupMock,
    reopen: mocks.trackReopenMock,
    requestReopen: mocks.trackRequestReopenMock,
    decideReopenRequest: mocks.decideReopenRequestMock,
    setVisibility: mocks.setVisibilityMock,
  },
  issueApi: {
    update: mocks.issueUpdateMock,
  },
  r2Api: {
    requestSourceFollowupUpload: mocks.requestSourceFollowupUploadMock,
    confirmSourceFollowupUpload: mocks.confirmSourceFollowupUploadMock,
  },
  uploadToR2: mocks.uploadToR2Mock,
  discussionApi: { create: mocks.discussionCreateMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

type WaveformMockThis = {
  playbackScope?: string
  $emit: (event: string, ...args: unknown[]) => void
}

vi.mock('@/components/audio/WaveformPlayer.vue', () => ({
  default: {
    props: ['audioUrl', 'compareAudioUrl', 'compareIssues', 'issues', 'playbackScope'],
    emits: ['ready', 'timeupdate', 'playbackStateChange', 'regionClick'],
    mounted(this: WaveformMockThis) {
      const scope = this.playbackScope ?? 'source'
      this.$emit('ready', scope === 'master' ? 240 : 180)
      this.$emit('timeupdate', scope === 'master' ? 24 : 18)
      this.$emit('playbackStateChange', false)
    },
    methods: {
      async playFrom(this: WaveformMockThis, time: number) {
        const scope = this.playbackScope ?? 'source'
        mocks.waveformPlayFromMock(scope, time)
        this.$emit('timeupdate', time)
        this.$emit('playbackStateChange', true)
      },
      seekTo(this: WaveformMockThis, time: number) {
        const scope = this.playbackScope ?? 'source'
        mocks.waveformSeekToMock(scope, time)
        this.$emit('timeupdate', time)
      },
      async togglePlay(this: WaveformMockThis) {
        const scope = this.playbackScope ?? 'source'
        mocks.waveformTogglePlayMock(scope)
        this.$emit('playbackStateChange', false)
      },
      getCurrentTime(this: WaveformMockThis) {
        return this.playbackScope === 'master' ? 24 : 18
      },
      exportPeaks(this: WaveformMockThis, maxLength: number) {
        const scope = this.playbackScope ?? 'source'
        mocks.waveformExportPeaksMock(scope, maxLength)
        return scope === 'master' ? [0.1, 0.3, 0.9] : [0.25, 0.5, 0.75]
      },
    },
    template: '<div class="waveform">scope:{{ playbackScope ?? "source" }} audio:{{ audioUrl ?? "none" }} compare:{{ compareAudioUrl || "none" }} issues:{{ issues?.length ?? 0 }}</div>',
  },
}))

vi.mock('@/components/audio/IssueMarkerList.vue', () => ({
  default: {
    props: ['issues', 'track', 'assignments', 'showActivity', 'enableQuickActions'],
    emits: ['select', 'status-change'],
    template: `
      <div
        class="issue-list"
        :data-show-activity="showActivity ? 'true' : 'false'"
        :data-quick-actions="enableQuickActions ? 'true' : 'false'"
      >
        <span class="issue-count">{{ issues.length }}</span>
        <button
          v-for="issue in issues"
          :key="'select-' + issue.id"
          type="button"
          class="issue-select"
          @click="$emit('select', issue)"
        >
          {{ issue.title }}:{{ issue.status }}
        </button>
        <button
          v-for="issue in issues"
          :key="'quick-' + issue.id"
          type="button"
          class="quick-status"
          @click.stop="$emit('status-change', { issue, status: 'resolved' })"
        >
          quick {{ issue.id }}
        </button>
      </div>
    `,
  },
}))

vi.mock('@/components/workflow/WorkflowProgress.vue', () => ({
  default: {
    template: '<div class="workflow-progress"></div>',
  },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<div class="status-badge" />' },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: `
      <div class="compare-select">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="compare-option"
          @click="$emit('update:modelValue', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    `,
  },
}))

vi.mock('@/components/common/CommentInput.vue', () => ({
  default: {
    emits: ['submit'],
    data: () => ({ content: '' }),
    methods: {
      reset(this: { content: string }) {
        this.content = ''
      },
    },
    template: `
      <div>
        <textarea v-model="content"></textarea>
        <button class="comment-submit" @click="$emit('submit', { content, images: [], audios: [] })">submit</button>
      </div>
    `,
  },
}))

vi.mock('@/composables/useAudioDownload', () => ({
  useAudioDownload: () => ({
    downloading: ref(false),
    downloadProgress: ref(0),
    downloadTrackAudio: mocks.downloadTrackAudioMock,
  }),
}))


vi.mock('@/components/IssueDetailPanel.vue', () => ({
  default: {
    props: ['issue', 'track', 'assignments', 'issues', 'mentionCandidates', 'sourceVersions'],
    emits: ['close', 'updated', 'open-issue'],
    template: `
      <div class="issue-detail-panel" :data-open="issue ? 'true' : 'false'">
        <span class="drawer-title">{{ issue?.title ?? '' }}</span>
        <span class="drawer-status">{{ issue?.status ?? '' }}</span>
        <button type="button" class="drawer-close" @click="$emit('close')">close</button>
        <button
          v-if="issue"
          type="button"
          class="drawer-update"
          @click="$emit('updated', Object.assign({}, issue, { title: issue.title + ' updated', status: 'resolved' }))"
        >
          update
        </button>
        <button type="button" class="drawer-open-linked" @click="$emit('open-issue', 2)">linked</button>
      </div>
    `,
  },
}))
vi.mock('@/components/chat/MasteringChatSidebar.vue', () => ({
  default: {
    methods: {
      openPanel() {},
      handleDiscussionEvent() {},
    },
    template: '<div class="mastering-chat-sidebar" />',
  },
}))


const makeIssue = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  track_id: 7,
  local_number: 1,
  author_id: 4,
  phase: 'peer',
  workflow_cycle: 2,
  source_version_id: overrides.source_version_number === 2 ? 201 : 301,
  source_version_number: 3,
  master_delivery_id: null,
  title: 'Current version',
  description: 'desc',
  severity: 'major',
  status: 'open',
  markers: [],
  created_at: '2024-01-03T00:00:00Z',
  updated_at: '2024-01-03T00:00:00Z',
  comment_count: 0,
  ...overrides,
})

function makeTrackDetailResponse(overrides: {
  track?: Record<string, unknown>
  issues?: Array<Record<string, unknown>>
  source_versions?: TrackSourceVersion[]
  master_deliveries?: Array<Record<string, unknown>>
} = {}) {
  const track = {
    id: 7,
    album_id: 5,
    status: 'peer_review',
    title: 'Track 7',
    artist: 'Nova',
    version: 3,
    workflow_cycle: 2,
    file_path: '/audio.wav',
    submitter_id: 2,
    producer_id: 8,
    allowed_actions: ['peer_review'],
    open_issue_count: 1,
    submitter: { display_name: 'Nova' },
    peer_reviewer: { id: 4, display_name: 'Echo' },
    current_source_version: historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' }),
    current_master_delivery: null,
    ...overrides.track,
  }
  return {
    track,
    issues: overrides.issues ?? [
      makeIssue({ id: 1, local_number: 1, title: 'Current version', status: 'open', source_version_number: 3 }),
      makeIssue({ id: 2, local_number: 2, title: 'Older version', status: 'open', source_version_number: 2 }),
      makeIssue({ id: 3, local_number: 3, workflow_cycle: 1, title: 'Older cycle', status: 'open', source_version_number: 3 }),
    ],
    discussions: [],
    events: [],
    source_versions: overrides.source_versions ?? [
      historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' }),
      historySource(201, 2, { created_at: '2024-01-02T00:00:00Z' }),
    ],
    ...(overrides.master_deliveries ? { master_deliveries: overrides.master_deliveries } : {}),
  }
}
import TrackDetailView from './TrackDetailView.vue'

function mountTrackDetailView() {
  return mountWithPlugins(TrackDetailView, {
    global: {
      mocks: {
        $route: mocks.route,
      },
    },
  })
}

describe('TrackDetailView', () => {
  beforeEach(() => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7',
      params: { id: '7' },
      query: {},
    }
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.openMock.mockReset()
    mocks.discussionCreateMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.listAssignmentsMock.mockReset()
    mocks.uploadSourceVersionMock.mockReset()
    mocks.createSourceFollowupMock.mockReset()
    mocks.decideSourceFollowupMock.mockReset()
    mocks.cancelSourceFollowupMock.mockReset()
    mocks.requestSourceFollowupUploadMock.mockReset()
    mocks.confirmSourceFollowupUploadMock.mockReset()
    mocks.uploadToR2Mock.mockReset()
    mocks.trackReopenMock.mockReset()
    mocks.trackRequestReopenMock.mockReset()
    mocks.decideReopenRequestMock.mockReset()
    mocks.setVisibilityMock.mockReset()
    mocks.issueUpdateMock.mockReset()
    mocks.downloadTrackAudioMock.mockReset()
    mocks.waveformPlayFromMock.mockReset()
    mocks.waveformSeekToMock.mockReset()
    mocks.waveformTogglePlayMock.mockReset()
    mocks.waveformExportPeaksMock.mockReset()
    mocks.currentUser = { id: 2 }
    localStorage.clear()
    vi.stubGlobal('open', mocks.openMock)
    mocks.trackReopenMock.mockResolvedValue({})
    mocks.trackRequestReopenMock.mockResolvedValue({})
    mocks.setVisibilityMock.mockResolvedValue({ is_public: true })
    mocks.uploadSourceVersionMock.mockResolvedValue({})
    mocks.createSourceFollowupMock.mockResolvedValue({})
    mocks.decideSourceFollowupMock.mockResolvedValue({})
    mocks.cancelSourceFollowupMock.mockResolvedValue({})
    mocks.requestSourceFollowupUploadMock.mockResolvedValue({ upload_url: 'https://upload.example', object_key: 'draft.wav' })
    mocks.confirmSourceFollowupUploadMock.mockResolvedValue({})
    mocks.uploadToR2Mock.mockResolvedValue(undefined)
    mocks.listAssignmentsMock.mockResolvedValue([])
    mocks.issueUpdateMock.mockImplementation((id: number, data: { status?: string }) => Promise.resolve(makeIssue({
      id,
      local_number: id,
      title: id === 1 ? 'Current version' : 'Older version',
      status: data.status ?? 'open',
    })))
    mocks.trackGetMock.mockResolvedValue({
      track: {
        id: 7,
        album_id: 5,
        status: 'peer_review',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['peer_review'],
        open_issue_count: 1,
        submitter: { display_name: 'Nova' },
        peer_reviewer: { id: 4, display_name: 'Echo' },
        current_source_version: { id: 301, version_number: 3, source_kind: 'file', file_path: '/audio.wav' },
        current_master_delivery: null,
      },
      issues: [
        makeIssue({ id: 1, local_number: 1, title: 'Current version', status: 'open', source_version_number: 3 }),
        makeIssue({ id: 2, local_number: 2, title: 'Older version', status: 'open', source_version_number: 2 }),
        makeIssue({ id: 3, local_number: 3, workflow_cycle: 1, title: 'Older cycle', status: 'open', source_version_number: 3 }),
      ],
      discussions: [],
      events: [],
      source_versions: [
        historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' }),
        historySource(201, 2, { created_at: '2024-01-02T00:00:00Z' }),
      ],
    })
    mocks.discussionCreateMock.mockResolvedValue({
      id: 99,
      content: 'Fresh discussion',
      created_at: '2024-01-04T00:00:00Z',
      author: { display_name: 'Nova', avatar_color: '#123456' },
      images: [],
    })
  })

  it('keeps cross-cycle issue history while filtering waveform markers to the current audio', async () => {
    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.issue-count').text()).toBe('3')
    expect(wrapper.text()).toContain('Older cycle')
    expect(wrapper.find('.waveform').text()).toContain('issues:1')
    expect(wrapper.find('.waveform').text()).toContain('compare:none')

    await wrapper.find('textarea').setValue(' Fresh discussion ')
    await wrapper.find('button.comment-submit').trigger('click')
    await flushPromises()

    expect(mocks.discussionCreateMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ content: 'Fresh discussion' }),
      expect.any(Function),
    )
    expect(wrapper.text()).toContain('Fresh discussion')
  })

  it('opens issue details in the same-page drawer by default', async () => {
    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.issue-list').attributes('data-quick-actions')).toBe('true')
    await wrapper.findAll('.issue-select')[0].trigger('click')
    await flushPromises()

    expect(wrapper.find('.drawer-title').text()).toBe('Current version')
    expect(mocks.replaceMock).toHaveBeenCalledWith({ path: '/tracks/7', query: { issue: '1' } })
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })



  it('renders text-only master deliveries without creating a master waveform', async () => {
    const currentMasterDelivery = {
      id: 31,
      delivery_number: 2,
      workflow_cycle: 2,
      file_path: null,
      delivery_kind: 'text',
      delivery_message: 'https://cloud.example/stems\ncode: bk24',
      created_at: '2024-01-04T00:00:00Z',
      producer_approved_at: null,
      submitter_approved_at: null,
    }
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        status: 'final_review',
        allowed_actions: [],
        current_master_delivery: currentMasterDelivery,
      },
      issues: [],
      master_deliveries: [currentMasterDelivery],
    }))

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('https://cloud.example/stems')
    expect(wrapper.text()).toContain('This historical delivery has no playable audio file')
    expect(wrapper.text()).not.toContain('/api/tracks/7/master-audio')

  })

  it('lets an ordinary member play and download a completed current-cycle final without opening mastering history or chat', async () => {
    mocks.currentUser = { id: 42 }
    const finalDelivery = {
      id: 21,
      delivery_number: 4,
      workflow_cycle: 2,
      delivery_kind: 'file',
      file_path: 'master-v4.wav',
      created_at: '2024-01-04T00:00:00Z',
      confirmed_at: null,
      producer_approved_at: null,
      submitter_approved_at: null,
      delivery_message: 'Private mastering delivery note',
    }
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        status: 'completed',
        allowed_actions: [],
        mastering_engineer_id: 9,
        viewer_is_mastering_participant: false,
        viewer_can_access_master_audio: true,
        current_master_delivery: finalDelivery,
      },
      issues: [makeIssue({ title: 'Peer issue remains visible' })],
      master_deliveries: [
        finalDelivery,
        { ...finalDelivery, id: 20, delivery_number: 3, delivery_message: 'Older private draft' },
      ],
    }))

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const masterPlayer = wrapper.findAll('.waveform').find(player => player.text().includes('scope:master'))
    expect(masterPlayer?.text()).toContain('/api/tracks/7/master-deliveries/21/audio')
    expect(masterPlayer?.text()).toContain('issues:0')
    expect(wrapper.text()).toContain('Master Audio')
    expect(wrapper.text()).toContain('Peer issue remains visible')
    expect(wrapper.text()).not.toContain('Final-review issue remains visible')
    expect(wrapper.text()).not.toContain('Private mastering delivery note')
    expect(wrapper.text()).not.toContain('Older private draft')
    expect(wrapper.text()).not.toContain('Final approvals')
    expect(wrapper.text()).not.toContain('Master Delivery History')
    expect(wrapper.text()).not.toContain('View Mastering History')
    expect(wrapper.text()).not.toContain('Open Mastering Page')
    expect(wrapper.find('.mastering-chat-sidebar').exists()).toBe(false)

    const downloads = wrapper.findAll('button').filter(button => button.text() === 'Download Audio')
    expect(downloads).toHaveLength(2)
    await downloads[1]!.trigger('click')
    expect(mocks.downloadTrackAudioMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: expect.stringContaining('/api/tracks/7/master-deliveries/21/audio?v=4&c=2&t=') }),
      expect.objectContaining({ value: expect.objectContaining({ current_master_delivery: finalDelivery }) }),
      '_master',
    )
    wrapper.unmount()
  })

  it.each(['mastering', 'mastering_revision', 'final_review', 'peer_review'])(
    'hides all master playback, summary and workspace controls from an ordinary member while a public track is %s',
    async (status) => {
      mocks.currentUser = { id: 42 }
      mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
        track: {
          status,
          is_public: true,
          allowed_actions: [],
          mastering_engineer_id: 9,
          viewer_is_mastering_participant: false,
          viewer_can_access_master_audio: false,
          mastering_notes: 'Private mastering notes',
          current_master_delivery: {
            id: 21,
            delivery_number: 4,
            workflow_cycle: 2,
            delivery_kind: 'file',
            file_path: 'private-master.wav',
            confirmed_at: '2024-01-04T00:00:00Z',
            delivery_message: 'Private mastering delivery note',
          },
        },
        issues: [],
      }))

      const wrapper = mountTrackDetailView()
      await flushPromises()

      expect(wrapper.findAll('.waveform')).toHaveLength(1)
      expect(wrapper.text()).not.toContain('/api/tracks/7/master-audio')
      expect(wrapper.text()).not.toContain('Master Audio')
      expect(wrapper.text()).not.toContain('Current Master')
      expect(wrapper.text()).not.toContain('Final approvals')
      expect(wrapper.text()).not.toContain('Private mastering delivery note')
      expect(wrapper.text()).not.toContain('Private mastering notes')
      expect(wrapper.text()).not.toContain('Open Mastering Page')
      expect(wrapper.text()).not.toContain('View Mastering History')
      expect(wrapper.find('.mastering-chat-sidebar').exists()).toBe(false)
      expect(wrapper.findAll('button').filter(button => button.text() === 'Download Audio')).toHaveLength(1)
      expect(mocks.downloadTrackAudioMock).not.toHaveBeenCalled()
      wrapper.unmount()
    },
  )

  it('withholds a prior-cycle master from completed ordinary viewers when capability flags are absent', async () => {
    mocks.currentUser = { id: 42 }
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        status: 'completed',
        allowed_actions: [],
        mastering_engineer_id: 9,
        current_master_delivery: {
          id: 20,
          delivery_number: 3,
          workflow_cycle: 1,
          file_path: 'old-final-master.wav',
          confirmed_at: '2024-01-04T00:00:00Z',
        },
      },
      issues: [],
    }))

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.findAll('.waveform')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('/api/tracks/7/master-audio')
    expect(wrapper.text()).not.toContain('Current Master')
    expect(wrapper.find('.mastering-chat-sidebar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps issues from older workflow cycles out of the current waveform', async () => {
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        status: 'peer_review',
        version: 4,
        workflow_cycle: 3,
        current_source_version: { id: 401 },
        current_master_delivery: null,
        open_issue_count: 1,
      },
      issues: [
        makeIssue({
          id: 31,
          local_number: 1,
          phase: 'final_review',
          workflow_cycle: 2,
          title: 'Old master issue',
          source_version_number: null,
          master_delivery_id: 20,
          markers: [{ time_start: 30, time_end: 34 }],
        }),
      ],
      source_versions: [
        historySource(401, 4, { file_path: '/audio.wav', created_at: '2024-01-04T00:00:00Z' }),
        historySource(301, 3, { created_at: '2024-01-03T00:00:00Z' }),
      ],
    }))

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.issue-count').text()).toBe('1')
    expect(wrapper.text()).toContain('Old master issue')

    const waveforms = wrapper.findAll('.waveform')
    expect(waveforms).toHaveLength(1)
    expect(waveforms[0].text()).toContain('scope:source')
    expect(waveforms[0].text()).toContain('issues:0')
    expect(wrapper.text()).not.toContain('scope:master')
  })

  it('persists legacy detail-page mode and keeps the old issue navigation', async () => {
    const wrapper = mountTrackDetailView()
    await flushPromises()

    const legacyButton = wrapper.findAll('button').find(button => button.text() === 'Legacy page')
    expect(legacyButton).toBeTruthy()
    await legacyButton!.trigger('click')

    expect(localStorage.getItem('backkitchen_issue_detail_mode_2')).toBe('legacy')
    await wrapper.findAll('.issue-select')[0].trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/issues/1', query: undefined })
    expect(wrapper.find('.drawer-title').text()).toBe('')
  })

  it('opens the issue drawer from the issue route query after track data loads', async () => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7?issue=1',
      params: { id: '7' },
      query: { issue: '1' },
    }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.drawer-title').text()).toBe('Current version')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })

  it('opens an issue from a previous workflow cycle through the route query', async () => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7?issue=3',
      params: { id: '7' },
      query: { issue: '3' },
    }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.drawer-title').text()).toBe('Older cycle')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })

  it('routes issue query deep links to the legacy detail page when legacy mode is selected', async () => {
    localStorage.setItem('backkitchen_issue_detail_mode_2', 'legacy')
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7?issue=1',
      params: { id: '7' },
      query: { issue: '1' },
    }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/issues/1', query: undefined })
    expect(wrapper.find('.drawer-title').text()).toBe('')
  })

  it('opens local linked issues in the same drawer and applies panel updates', async () => {
    const wrapper = mountTrackDetailView()
    await flushPromises()

    await wrapper.findAll('.issue-select')[0].trigger('click')
    await flushPromises()
    await wrapper.find('.drawer-update').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.issue-select')[0].text()).toContain('Current version updated:resolved')

    mocks.replaceMock.mockClear()
    await wrapper.find('.drawer-open-linked').trigger('click')
    await flushPromises()

    expect(wrapper.find('.drawer-title').text()).toBe('Older version')
    expect(mocks.replaceMock).toHaveBeenCalledWith({ path: '/tracks/7', query: { issue: '2' } })
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })

  it('updates quick issue status optimistically and applies the API result', async () => {
    let resolveUpdate!: (issue: unknown) => void
    mocks.issueUpdateMock.mockReturnValueOnce(new Promise(resolve => {
      resolveUpdate = resolve
    }))
    const wrapper = mountTrackDetailView()
    await flushPromises()

    await wrapper.findAll('.quick-status')[0].trigger('click')

    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(1, { status: 'resolved' })
    expect(wrapper.findAll('.issue-select')[0].text()).toContain('Current version:resolved')

    resolveUpdate(makeIssue({ id: 1, local_number: 1, title: 'Server resolved', status: 'resolved' }))
    await flushPromises()

    expect(wrapper.findAll('.issue-select')[0].text()).toContain('Server resolved:resolved')
    expect(wrapper.find('.drawer-title').text()).toBe('')
  })

  it('updates the status of an issue from a previous workflow cycle', async () => {
    mocks.issueUpdateMock.mockResolvedValueOnce(makeIssue({
      id: 3,
      local_number: 3,
      workflow_cycle: 1,
      title: 'Older cycle resolved',
      status: 'resolved',
    }))
    const wrapper = mountTrackDetailView()
    await flushPromises()

    await wrapper.findAll('.quick-status')[2].trigger('click')
    await flushPromises()

    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(3, { status: 'resolved' })
    expect(wrapper.findAll('.issue-select')[2].text()).toContain('Older cycle resolved:resolved')
  })

  it('reverts quick issue status when the API update fails', async () => {
    let rejectUpdate!: (error: Error) => void
    mocks.issueUpdateMock.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectUpdate = reject
    }))
    const wrapper = mountTrackDetailView()
    await flushPromises()

    await wrapper.findAll('.quick-status')[0].trigger('click')
    expect(wrapper.findAll('.issue-select')[0].text()).toContain('Current version:resolved')

    rejectUpdate(new Error('No permission'))
    await flushPromises()

    expect(wrapper.findAll('.issue-select')[0].text()).toContain('Current version:open')
  })

  it('shows proxy submission identity on the track summary', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'peer_review',
        title: 'Track 7',
        artist: 'Offline Composer',
        version: 1,
        workflow_cycle: 1,
        file_path: '/audio.wav',
        submitter_id: 8,
        proxy_uploader_id: 8,
        producer_id: 8,
        allowed_actions: [],
        open_issue_count: 0,
        submitter: { id: 8, display_name: 'Kira' },
        proxy_uploader: { id: 8, display_name: 'Kira' },
        peer_reviewer: null,
        current_source_version: { id: 301 },
        current_master_delivery: null,
        is_proxy_submission: true,
        external_submitter_name: 'Offline Composer',
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 1, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('External composers')
    expect(wrapper.text()).toContain('Offline Composer')
    expect(wrapper.text()).toContain('Composer-side proxy')
    expect(wrapper.text()).toContain('Kira')
  })

  it('does not show platform composer ids when composer users are absent', async () => {
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        artist: null,
        submitter: null,
        composer_ids: [16],
        composers: [],
      },
      issues: [],
    }))

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Platform composers')
    expect(wrapper.text()).not.toContain('#16')
  })

  it('keeps #n labels on timeline events for issues from previous workflow cycles', async () => {
    const detail = makeTrackDetailResponse()
    mocks.trackGetMock.mockResolvedValueOnce({
      ...detail,
      events: [
        {
          id: 101,
          event_type: 'issue_created',
          payload: { issue_id: 3 },
          actor: { display_name: 'Echo' },
          created_at: '2024-01-04T00:00:00Z',
        },
      ],
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    // Issue 3 belongs to an older workflow_cycle, and the timeline must keep
    // resolving the same track-local issue number.
    expect(wrapper.text()).toContain('#3')
  })

  it('opens compare mode from the route query', async () => {
    mocks.route = {
      name: 'track-detail',
      path: '/tracks/7',
      fullPath: '/tracks/7?compareVersion=201',
      params: { id: '7' },
      query: { compareVersion: '201' },
    }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.waveform').text()).toContain('compare:/api/tracks/7/source-versions/201/audio?v=2&c=2')
  })

  it('shows the current visibility separately from the toggle action', async () => {
    mocks.currentUser = { id: 8 }

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('Visible to participants only')
    expect(wrapper.findAll('button').some(button => button.text() === 'Make visible to all members')).toBe(true)
  })

  it('lets manager-flagged viewers control producer-side visibility', async () => {
    mocks.currentUser = { id: 42 }
    mocks.trackGetMock.mockResolvedValueOnce(makeTrackDetailResponse({
      track: {
        producer_id: 8,
        submitter_id: 2,
        viewer_is_album_manager: true,
        is_public: false,
      },
    }))
    mocks.setVisibilityMock.mockResolvedValueOnce({ is_public: true })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const visibilityButton = wrapper.findAll('button').find(button => button.text() === 'Make visible to all members')
    expect(visibilityButton).toBeTruthy()

    await visibilityButton!.trigger('click')
    await flushPromises()

    expect(mocks.setVisibilityMock).toHaveBeenCalledWith(7, true)
    expect(wrapper.text()).toContain('Visible to all members')
  })

  it('renders the mastering chat sidebar before the track enters mastering', async () => {
    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.find('.mastering-chat-sidebar').exists()).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text() === 'Open Mastering Page')).toBe(false)
  })

  it('dedupes duplicate active reviewer assignments in the summary', async () => {
    mocks.currentUser = { id: 8 }
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'peer_review',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['peer_review'],
        workflow_step: {
          id: 'peer_review',
          label: 'Peer Review',
          type: 'review',
          assignee_role: 'peer_reviewer',
          assignment_mode: 'manual',
          required_reviewer_count: 2,
          order: 0,
          transitions: {},
        },
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        peer_reviewer: { id: 4, display_name: 'Echo' },
        current_source_version: { id: 301 },
        current_master_delivery: null,
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
    })
    mocks.listAssignmentsMock.mockResolvedValueOnce([
      {
        id: 10,
        track_id: 7,
        stage_id: 'peer_review',
        user_id: 4,
        status: 'completed',
        decision: 'pass',
        assigned_at: '2024-01-03T00:00:00Z',
        completed_at: '2024-01-03T00:10:00Z',
        cancellation_reason: null,
        user: { id: 4, display_name: 'Echo' },
      },
      {
        id: 11,
        track_id: 7,
        stage_id: 'peer_review',
        user_id: 4,
        status: 'completed',
        decision: 'pass',
        assigned_at: '2024-01-04T00:00:00Z',
        completed_at: '2024-01-04T00:10:00Z',
        cancellation_reason: null,
        user: { id: 4, display_name: 'Echo' },
      },
      {
        id: 12,
        track_id: 7,
        stage_id: 'peer_review',
        user_id: 5,
        status: 'pending',
        decision: null,
        assigned_at: '2024-01-04T00:00:00Z',
        completed_at: null,
        cancellation_reason: null,
        user: { id: 5, display_name: 'Mika' },
      },
    ])

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('1/2')
    expect(wrapper.text()).not.toContain('2/2')
    expect(wrapper.text().match(/Echo/g)).toHaveLength(1)
    expect(wrapper.text()).toContain('Mika')
  })

  it('shows a mastering history entry after the track is reopened before mastering', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'peer_review',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['peer_review'],
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: {
          id: 21,
          delivery_number: 4,
          workflow_cycle: 1,
          file_path: 'master-v4.wav',
          created_at: '2024-01-04T00:00:00Z',
          producer_approved_at: '2024-01-05T00:00:00Z',
          submitter_approved_at: '2024-01-06T00:00:00Z',
        },
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.findAll('button').some(button => button.text() === 'View Mastering History')).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text() === 'Open Mastering Page')).toBe(false)
    expect(wrapper.text()).toContain('audio:/api/tracks/7/master-deliveries/21/audio')
    expect(wrapper.find('.mastering-chat-sidebar').exists()).toBe(true)
  })

  it('renders current master audio in a separate waveform and filters master issues to the active delivery', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'mastering',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: [],
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: {
          id: 21,
          delivery_number: 4,
          workflow_cycle: 2,
          file_path: 'master-v4.wav',
          created_at: '2024-01-04T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
      },
      issues: [
        { id: 11, phase: 'final_review', workflow_cycle: 2, master_delivery_id: 21, title: 'Current delivery issue' },
        { id: 12, phase: 'final_review', workflow_cycle: 2, master_delivery_id: 20, title: 'Older delivery issue' },
        { id: 13, phase: 'peer', workflow_cycle: 2, source_version_number: 3, title: 'Source issue' },
      ],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
      master_deliveries: [
        {
          id: 21,
          delivery_number: 4,
          workflow_cycle: 2,
          file_path: 'master-v4.wav',
          created_at: '2024-01-04T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
        {
          id: 20,
          delivery_number: 3,
          workflow_cycle: 2,
          file_path: 'master-v3.wav',
          created_at: '2024-01-03T00:00:00Z',
          producer_approved_at: null,
          submitter_approved_at: null,
        },
      ],
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const waveforms = wrapper.findAll('.waveform')
    expect(waveforms).toHaveLength(2)
    expect(waveforms[1].text()).toContain('scope:master')
    expect(waveforms[1].text()).toContain('audio:/api/tracks/7/master-deliveries/21/audio')
    expect(waveforms[1].text()).toContain('issues:1')
    expect(waveforms[1].text()).toContain('compare:none')
    expect(wrapper.find('.issue-count').text()).toBe('3')
    expect(wrapper.text()).toContain('Older delivery issue')
    expect(wrapper.findAll('button').some(button => button.text() === 'Open Mastering Page')).toBe(true)
  })

  it('shows a single step CTA for custom workflows', async () => {
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'intake',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['accept', 'reject_final'],
        viewer_can_open_workflow: true,
        workflow_step: { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: {} },
        open_issue_count: 1,
        submitter: { display_name: 'Nova' },
        peer_reviewer: { id: 4, display_name: 'Echo' },
        current_source_version: { id: 301 },
        current_master_delivery: null,
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
      workflow_config: { version: 2, steps: [{ id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: { accept: 'peer_review' } }] },
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const buttons = wrapper.findAll('button.workflow-cta-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons.every(button => button.text().includes('Open Intake'))).toBe(true)

    await buttons[0].trigger('click')
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/7/step/intake', query: undefined })
  })

  it('keeps the followup form without a reception CTA for a composer with only optional actions', async () => {
    mocks.trackGetMock.mockResolvedValue(makeTrackDetailResponse({ track: {
      status: 'intake',
      allowed_actions: ['request_source_followup'],
      viewer_can_open_workflow: false,
      viewer_has_pending_work: false,
      workflow_step: { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: {} },
    } }))
    const wrapper = mountTrackDetailView()
    await flushPromises()
    expect(wrapper.findAll('button.workflow-cta-btn')).toHaveLength(0)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['approve', 'reject'] as const)('clears the pending reopen card after %s and reloads the next task', async (decision) => {
    const pending = makeTrackDetailResponse({ track: {
      status: 'completed', viewer_is_album_manager: true, viewer_has_pending_work: true,
      viewer_can_open_workflow: false, allowed_actions: ['direct_reopen'],
      pending_reopen_request: { id: 19, target_stage_id: 'mastering', reason: 'Restore dynamics', status: 'pending' },
    } })
    mocks.trackGetMock.mockResolvedValueOnce(pending).mockResolvedValue(makeTrackDetailResponse({
      track: { status: decision === 'approve' ? 'mastering' : 'completed', pending_reopen_request: null },
    }))
    mocks.decideReopenRequestMock.mockResolvedValue({ status: decision === 'approve' ? 'approved' : 'rejected' })
    const wrapper = mountTrackDetailView()
    await flushPromises()
    expect(wrapper.text()).toContain('Restore dynamics')
    await wrapper.findAll('button').find(button => button.text() === (decision === 'approve' ? 'Approve reopen' : 'Reject request'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Restore dynamics')
    expect(wrapper.text()).not.toContain('Reopen request pending')
    wrapper.unmount()
  })

  it('keeps a failed reopen decision available and leaves requester views read-only', async () => {
    const response = makeTrackDetailResponse({ track: {
      status: 'completed', viewer_is_album_manager: true, viewer_has_pending_work: true,
      allowed_actions: ['direct_reopen'],
      pending_reopen_request: { id: 19, target_stage_id: 'mastering', reason: 'Restore dynamics', status: 'pending' },
    } })
    mocks.trackGetMock.mockResolvedValue(response)
    mocks.decideReopenRequestMock.mockRejectedValue(new Error('Permission changed'))
    const wrapper = mountTrackDetailView()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Approve reopen')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Restore dynamics')
    expect(wrapper.findAll('button').find(button => button.text() === 'Approve reopen')!.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
    mocks.trackGetMock.mockResolvedValue(makeTrackDetailResponse({ track: {
      ...response.track, viewer_is_album_manager: false, viewer_has_pending_work: false, allowed_actions: ['request_reopen'],
    } }))
    const requester = mountTrackDetailView()
    await flushPromises()
    expect(requester.text()).toContain('Restore dynamics')
    expect(requester.findAll('button').some(button => ['Approve reopen', 'Reject request', 'Request Workflow Reopen'].includes(button.text()))).toBe(false)
    requester.unmount()
  })

  it('shows a resubmit upload entry for resubmittable rejected tracks', async () => {
    const updatedTrack = {
      id: 7,
      album_id: 5,
      status: 'intake',
      title: 'Track 7',
      artist: 'Nova',
      version: 4,
      workflow_cycle: 3,
      file_path: '/audio-v4.wav',
      submitter_id: 2,
      producer_id: 8,
      allowed_actions: ['accept'],
      workflow_step: { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: {} },
      open_issue_count: 0,
      submitter: { display_name: 'Nova' },
      current_source_version: { id: 401 },
      current_master_delivery: null,
    }
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'rejected',
        rejection_mode: 'resubmittable',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        allowed_actions: ['resubmit'],
        workflow_step: null,
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: null,
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
      workflow_config: { version: 2, steps: [{ id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: {} }] },
    })
    mocks.uploadSourceVersionMock.mockResolvedValueOnce(updatedTrack)

    const wrapper = mountTrackDetailView()
    await flushPromises()

    expect(wrapper.text()).toContain('Resubmit source')
    const file = new File(['RIFFdata'], 'resubmit.wav', { type: 'audio/wav' })
    const input = wrapper.find('input[accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    const submitButton = wrapper.findAll('button').find(button => button.text().includes('Upload new source'))
    expect(submitButton).toBeTruthy()
    await submitButton!.trigger('click')
    await flushPromises()

    expect(mocks.uploadSourceVersionMock).toHaveBeenCalledWith(
      7,
      file,
      undefined,
      expect.any(Function),
    )
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/7/step/intake', query: undefined })
  })

  it('prioritizes remaster reopen targets and labels them clearly', async () => {
    mocks.currentUser = { id: 2 }
    mocks.trackGetMock.mockResolvedValueOnce({
      track: {
        id: 7,
        album_id: 5,
        status: 'completed',
        title: 'Track 7',
        artist: 'Nova',
        version: 3,
        workflow_cycle: 2,
        file_path: '/audio.wav',
        submitter_id: 2,
        producer_id: 8,
        mastering_engineer_id: 9,
        allowed_actions: ['request_reopen'],
        open_issue_count: 0,
        submitter: { display_name: 'Nova' },
        current_source_version: { id: 301 },
        current_master_delivery: { producer_approved_at: '2024-01-01T00:00:00Z', submitter_approved_at: '2024-01-02T00:00:00Z' },
      },
      issues: [],
      discussions: [],
      events: [],
      source_versions: [historySource(301, 3, { file_path: '/audio.wav', created_at: '2024-01-03T00:00:00Z' })],
      workflow_config: {
        version: 2,
        steps: [
          { id: 'producer_revision', label: 'Producer Revision', type: 'revision', assignee_role: 'submitter', order: 2, transitions: {} },
          { id: 'mastering_revision', label: 'Mastering Revision', type: 'revision', assignee_role: 'submitter', order: 3, transitions: {} },
          { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 4, transitions: {} },
        ],
      },
    })

    const wrapper = mountTrackDetailView()
    await flushPromises()

    const reopenButton = wrapper.findAll('button').find(button => button.text().includes('Request Workflow Reopen'))
    expect(reopenButton).toBeTruthy()
    await reopenButton!.trigger('click')
    await flushPromises()

    const options = wrapper.findAll('option').map(option => option.text())
    expect(options[1]).toContain('remaster current delivery')
    expect(options[2]).toContain('revise source first, then remaster')
  })
})
