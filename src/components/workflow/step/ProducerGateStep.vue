<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft } from 'lucide-vue-next'
import type {
  ChecklistItem,
  Issue,
  IssueStatus,
  MentionCandidates,
  StageAssignment,
  Track,
  User,
  WorkflowConfig,
} from '@/types'
import { formatLocaleDate, formatTimestampShort } from '@/utils/time'
import { translateChecklistLabel } from '@/utils/checklist'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'

const props = defineProps<{
  track: Track
  workflowConfig: WorkflowConfig | null
  error: string
  // stats
  totalIssueCount: number
  openIssueCount: number
  resolvedIssueCount: number
  checklistPassedCount: number
  checklistItemCount: number
  checklistReviewerCount: number
  // waveform + compare
  audioUrl: string
  waveformIssues: Issue[]
  trackId: number
  hasComparableVersions: boolean
  showSourceCompare: boolean
  sourceCompareOptions: SelectOption[]
  compareSourceVersionId: number | null
  isSourceCompareActive: boolean
  waveformMode: 'seek' | 'annotate'
  hoveredIssueId: number | null
  downloading: boolean
  downloadProgress: number
  registerWaveform: (el: unknown) => void
  registerIssueForm: (el: unknown) => void
  formOpen: boolean
  // issues
  issues: Issue[]
  mentionCandidates: MentionCandidates
  displayedSourceVersionNumber: number | null
  reviewAssignments: StageAssignment[]
  // checklist summary
  checklistByReviewer: { user: User | null | undefined; items: ChecklistItem[] }[]
  // peer issue summary
  peerOpenCount: number
  peerResolvedCount: number
  peerDisagreedCount: number
  peerDiscussedCount: number
  peerIssues: Issue[]
  // producer followup
  producerOpenCount: number
  producerResolvedCount: number
  producerDisagreedCount: number
  producerSnapshotIssues: Issue[]
  batchUpdating: boolean
  producerBatchActions: IssueStatus[]
  selectedProducerIssueIds: number[]
  producerBatchNote: string
}>()

const emit = defineEmits<{
  back: []
  toggleSourceCompare: []
  'update:compareSourceVersionId': [value: number | null]
  download: []
  waveformReady: [duration: number]
  waveformTimeupdate: [time: number]
  waveformPlaybackStateChange: [isPlaying: boolean]
  requestWaveformMode: [mode: 'seek' | 'annotate']
  issueSelect: [issue: Issue]
  issueHover: [issue: Issue]
  issueLeave: []
  issueCreated: [issue: Issue]
  'update:formOpen': [open: boolean]
  'update:selectedProducerIssueIds': [ids: number[]]
  'update:producerBatchNote': [note: string]
  producerBatchClear: []
  producerBatchApply: [status: Issue['status']]
  quickStatusChange: [payload: { issue: Issue; status: Issue['status'] }]
  openIssue: [issue: Issue]
}>()

const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const checklistLabel = (label: string) => translateChecklistLabel(label, t)

// Local handle for waveform ⇄ issue-form cross-bindings; the instance is also
// registered upward so the view can drive hotkeys and preview playback.
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
function bindIssueForm(el: unknown) {
  issueFormRef.value = el as InstanceType<typeof IssueCreatePanel> | undefined
  props.registerIssueForm(el)
}

function peerIssueMarkerSummary(issue: Issue): string {
  if (!issue.markers.length) return t('issue.generalIssue')
  return issue.markers
    .map(marker => marker.time_end == null
      ? formatTimestampShort(marker.time_start)
      : `${formatTimestampShort(marker.time_start)} - ${formatTimestampShort(marker.time_end)}`)
    .join(' · ')
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
      </div>
      <button @click="emit('back')" class="btn-secondary !px-3 !py-2 flex-shrink-0 self-start" :aria-label="t('common.backToTrack')" :title="t('common.backToTrack')">
        <ChevronLeft class="w-4 h-4" />
      </button>
    </div>

    <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-foreground">{{ totalIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ openIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ resolvedIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
      </div>
      <div class="card text-center">
        <div v-if="checklistReviewerCount <= 1" class="text-2xl font-bold text-primary">
          {{ checklistPassedCount }}/{{ checklistItemCount }}
        </div>
        <div v-else class="text-2xl font-bold text-primary">{{ checklistReviewerCount }}</div>
        <div class="text-xs text-muted-foreground">
          {{ checklistReviewerCount <= 1 ? t('producer.checklistPassed') : t('producer.checklistReviewers') }}
        </div>
      </div>
    </div>

    <div v-if="audioUrl">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-muted-foreground leading-relaxed">{{ t('producer.waveformHint') }}</p>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="hasComparableVersions"
            @click="emit('toggleSourceCompare')"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="emit('download')" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
      <div v-if="showSourceCompare && hasComparableVersions" class="mb-3 space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect
            :model-value="compareSourceVersionId"
            :options="sourceCompareOptions"
            :placeholder="`-- ${t('compare.selectVersion')} --`"
            size="sm"
            @update:model-value="emit('update:compareSourceVersionId', $event)"
          />
          <button
            v-if="compareSourceVersionId"
            @click="emit('update:compareSourceVersionId', null)"
            class="text-xs text-muted-foreground hover:text-foreground"
          >
            {{ t('compare.clear') }}
          </button>
        </div>
        <p v-if="isSourceCompareActive" class="text-xs text-warning">
          {{ t('workflowStep.sourceCompareReadonlyHint') }}
        </p>
      </div>
      <WaveformPlayer
        :ref="registerWaveform"
        :audio-url="audioUrl"
        :issues="waveformIssues"
        zoomable
        :track-id="trackId"
        :compare-version-id="compareSourceVersionId"
        :selectable="true"
        :mode="waveformMode"
        :selected-range="issueFormRef?.selectedRange ?? null"
        :draft-markers="issueFormRef?.markers ?? []"
        :draft-range-anchor="issueFormRef?.rangeAnchor ?? null"
        :hovered-issue-id="hoveredIssueId"
        @click="(time: number) => issueFormRef?.handleClick(time)"
        @regionClick="emit('issueSelect', $event)"
        @rangeSelect="(start: number, end: number, isUpdate: boolean) => isUpdate ? issueFormRef?.handleRangeUpdate?.(start, end) : issueFormRef?.handleRangeSelect(start, end)"
        @issueHover="emit('issueHover', $event)"
        @issueLeave="emit('issueLeave')"
        @requestModeChange="emit('requestWaveformMode', $event)"
        @ready="emit('waveformReady', $event)"
        @timeupdate="emit('waveformTimeupdate', $event)"
        @playbackStateChange="emit('waveformPlaybackStateChange', $event)"
      />
    </div>

    <IssueCreatePanel
      :ref="bindIssueForm"
      :track-id="trackId"
      phase="producer"
      :allow-internal-visibility="false"
      :issues="issues"
      :mention-users="mentionCandidates.issue_public"
      :form-open="formOpen"
      @created="emit('issueCreated', $event)"
      @formOpenChange="emit('update:formOpen', $event)"
    >
      <template #heading>
        <h3 class="text-sm font-sans font-semibold text-foreground">
          {{ t('producer.producerIssuesHeading', { count: waveformIssues.length }) }}
        </h3>
      </template>
    </IssueCreatePanel>

    <IssueMarkerList
      :issues="waveformIssues"
      :current-source-version-number="displayedSourceVersionNumber"
      :hovered-issue-id="hoveredIssueId"
      :track="track"
      :assignments="reviewAssignments"
      :show-activity="true"
      :enable-quick-actions="true"
      @select="emit('issueSelect', $event)"
      @hover="emit('issueHover', $event)"
      @leave="emit('issueLeave')"
      @status-change="emit('quickStatusChange', $event)"
    />

    <div v-if="checklistItemCount > 0" class="card">
      <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.checklistHeading') }}</h3>
      <div v-if="checklistByReviewer.length === 1" class="space-y-2">
        <div v-for="item in checklistByReviewer[0].items" :key="item.id" class="flex items-center gap-3 text-sm">
          <span :class="item.passed ? 'text-success' : 'text-error'">{{ item.passed ? 'OK' : 'NG' }}</span>
          <span class="text-foreground">{{ checklistLabel(item.label) }}</span>
          <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
        </div>
      </div>
      <div v-else class="space-y-5">
        <div v-for="(group, idx) in checklistByReviewer" :key="group.user?.id ?? idx">
          <div class="text-xs font-mono text-muted-foreground mb-2">
            {{ group.user?.username ?? `#${idx + 1}` }}
          </div>
          <div class="space-y-2">
            <div v-for="item in group.items" :key="item.id" class="flex items-center gap-3 text-sm">
              <span :class="item.passed ? 'text-success' : 'text-error'">{{ item.passed ? 'OK' : 'NG' }}</span>
              <span class="text-foreground">{{ checklistLabel(item.label) }}</span>
              <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.peerIssueSummaryHeading') }}</h3>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs sm:min-w-[220px]">
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-error">{{ peerOpenCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.open') }}</div>
          </div>
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-success">{{ peerResolvedCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.resolved') }}</div>
          </div>
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-warning">{{ peerDisagreedCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.disagreed') }}</div>
          </div>
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-info">{{ peerDiscussedCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.activeDiscussions') }}</div>
          </div>
        </div>
      </div>

      <div v-if="peerIssues.length" class="space-y-3">
        <button
          v-for="issue in peerIssues"
          :key="issue.id"
          type="button"
          class="peer-issue-card w-full border border-border bg-background p-4 text-left transition-colors hover:border-muted-foreground/60 hover:bg-card"
              @click="emit('openIssue', issue)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge :status="issue.severity" type="severity" />
                <StatusBadge :status="issue.status" type="issue" />
                <span class="text-xs font-mono text-muted-foreground">{{ peerIssueMarkerSummary(issue) }}</span>
              </div>
              <div>
                <div class="text-sm font-medium text-foreground">{{ issue.title }}</div>
                <p class="mt-1 text-sm text-muted-foreground">{{ issue.description }}</p>
              </div>
            </div>
            <span class="text-xs font-mono text-muted-foreground whitespace-nowrap">{{ fmtDate(issue.updated_at) }}</span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              {{ t('issueDetail.commentsHeading', { count: issue.comment_count ?? 0 }) }}
            </span>
            <span
              v-if="(issue.comment_count ?? 0) > 0"
              class="rounded-full bg-info-bg px-2.5 py-1 text-info"
            >
              {{ t('producer.hasDiscussion') }}
            </span>
            <span class="text-primary">{{ t('producer.viewConversation') }}</span>
          </div>
        </button>
      </div>


    </div>

    <div class="card space-y-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.producerFollowupHeading') }}</h3>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs sm:min-w-[220px]">
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-error">{{ producerOpenCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.open') }}</div>
          </div>
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-success">{{ producerResolvedCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.resolved') }}</div>
          </div>
          <div class="border border-border bg-background px-3 py-2 space-y-1">
            <div class="font-mono text-lg text-info">{{ producerDisagreedCount }}</div>
            <div class="text-muted-foreground">{{ t('producer.disagreed') }}</div>
          </div>
        </div>
      </div>

      <BatchIssueActions
        :selected-count="selectedProducerIssueIds.length"
        :statuses="producerBatchActions"
        :note="producerBatchNote"
        :loading="batchUpdating"
        :issues="issues"
        :mention-users="mentionCandidates.issue_internal"
        @update:note="emit('update:producerBatchNote', $event)"
        @clear="emit('producerBatchClear')"
        @apply="emit('producerBatchApply', $event)"
      />

      <IssueMarkerList
        :issues="producerSnapshotIssues"
        :track="track"
        :selectable="true"
        :selected-ids="selectedProducerIssueIds"
        :current-source-version-number="track.version"
        :hovered-issue-id="hoveredIssueId"
        :show-activity="true"
        :enable-quick-actions="true"
        @select="emit('openIssue', $event)"
        @update:selectedIds="emit('update:selectedProducerIssueIds', $event)"
        @hover="emit('issueHover', $event)"
        @leave="emit('issueLeave')"
        @status-change="emit('quickStatusChange', $event)"
      />
    </div>
  </div>
</template>
