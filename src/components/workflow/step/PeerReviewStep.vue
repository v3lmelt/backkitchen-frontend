<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, CheckCircle2, ChevronLeft, UserRoundCog } from 'lucide-vue-next'
import type {
  ChecklistDraftItem,
  ChecklistDraftPrefillMeta,
  Issue,
  IssueStatus,
  MentionCandidates,
  StageAssignment,
  Track,
  WorkflowConfig,
} from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { translateChecklistLabel } from '@/utils/checklist'
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
  // review team
  waitingForAssignment: boolean
  canFinalizeReview: boolean
  requiresGroupFinalization: boolean
  currentUserAssignment: StageAssignment | null
  quorumReached: boolean
  usesFirstRevisionRequest: boolean
  hasRevisionSuggestion: boolean
  completedReviewCount: number
  requiredReviewCount: number
  canManageAssignments: boolean
  assignmentSaving: boolean
  assignmentButtonLabel: string
  assignments: StageAssignment[]
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
  // issues column
  issues: Issue[]
  mentionCandidates: MentionCandidates
  allowInternalVisibility: boolean
  listIssues: Issue[]
  displayedSourceVersionNumber: number | null
  reviewAssignments: StageAssignment[]
  batchUpdating: boolean
  batchActions: IssueStatus[]
  selectedIssueIds: number[]
  batchNote: string
  // checklist
  checklistEnabled: boolean
  checklistSaved: boolean
  checklistPrefill: ChecklistDraftPrefillMeta | null
  checklistPrefillStateLabel: string
  checklistDraft: ChecklistDraftItem[]
  checklistSaveButtonLabel: string
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
  'update:selectedIssueIds': [ids: number[]]
  'update:batchNote': [note: string]
  batchClear: []
  batchApply: [status: Issue['status']]
  quickStatusChange: [payload: { issue: Issue; status: Issue['status'] }]
  openReviewerAssignment: []
  submitChecklist: []
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('peerReview.heading', { title: track.title }) }}</h1>
      </div>
      <button @click="emit('back')" class="btn-secondary !px-3 !py-2 flex-shrink-0 self-start" :aria-label="t('common.backToTrack')" :title="t('common.backToTrack')">
        <ChevronLeft class="w-4 h-4" />
      </button>
    </div>

    <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div class="card space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.reviewTeamHeading') }}</h3>
          <p class="text-xs text-muted-foreground">
            <template v-if="waitingForAssignment">
              {{ t('workflowStep.reviewWaitingForAssignment') }}
            </template>
            <template v-else-if="canFinalizeReview">
              {{ t('workflowStep.reviewFinalizeReady') }}
            </template>
            <template v-else-if="requiresGroupFinalization && currentUserAssignment?.status === 'completed' && !quorumReached">
              {{ usesFirstRevisionRequest && hasRevisionSuggestion
                ? t('workflowStep.reviewWaitingForQuorumEarlyRevision')
                : t('workflowStep.reviewWaitingForQuorum', { completed: completedReviewCount, required: requiredReviewCount }) }}
            </template>
            <template v-else>
              {{ usesFirstRevisionRequest ? t('workflowStep.reviewSubmitHintEarlyRevision') : t('workflowStep.reviewSubmitHint') }}
            </template>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            v-if="canManageAssignments"
            type="button"
            class="h-9 inline-flex items-center gap-2 px-3 text-xs disabled:opacity-50"
            :class="assignments.length > 0 ? 'btn-secondary' : 'btn-primary'"
            :disabled="assignmentSaving"
            @click="emit('openReviewerAssignment')"
          >
            <UserRoundCog class="w-3.5 h-3.5" :stroke-width="2" />
            {{ assignmentSaving ? t('workflowStep.reviewerAssignmentWorking') : assignmentButtonLabel }}
          </button>
          <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-mono text-muted-foreground">
            <span class="text-foreground">{{ completedReviewCount }}/{{ requiredReviewCount }}</span>
            <span>{{ t('workflowStep.reviewProgress') }}</span>
          </div>
        </div>
      </div>

      <div v-if="assignments.length > 0" class="space-y-2">
        <div
          v-for="assignment in assignments"
          :key="assignment.id"
          class="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 text-sm"
        >
          <span class="text-foreground">
            {{ assignment.user?.display_name ?? `#${assignment.user_id}` }}
          </span>
          <div class="flex items-center gap-2 text-xs font-mono">
            <span
              class="rounded-full px-2.5 py-1"
              :class="assignment.status === 'completed' ? 'bg-success-bg text-success' : 'bg-border text-muted-foreground'"
            >
              {{ assignment.status === 'completed' ? t('workflowStep.reviewSubmitted') : t('workflowStep.reviewPending') }}
            </span>
            <span v-if="assignment.decision" class="rounded-full bg-info-bg px-2.5 py-1 text-info">
              {{ assignment.decision === 'pass' || assignment.decision === 'approve'
                ? t('workflowStep.reviewDecisionApprove')
                : t('workflowStep.reviewDecisionRevision') }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="audioUrl">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-muted-foreground leading-relaxed">{{ t('peerReview.waveformHint') }}</p>
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

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <IssueCreatePanel
          :ref="bindIssueForm"
          :track-id="trackId"
          phase="peer"
          :allow-internal-visibility="allowInternalVisibility"
          :issues="issues"
          :mention-users="mentionCandidates.issue_public"
          :public-mention-users="mentionCandidates.issue_public"
          :internal-mention-users="mentionCandidates.issue_internal"
          :form-open="formOpen"
          @created="emit('issueCreated', $event)"
          @formOpenChange="emit('update:formOpen', $event)"
        >
          <template #heading>
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.issuesHeading', { count: listIssues.length }) }}</h3>
          </template>
        </IssueCreatePanel>

        <BatchIssueActions
          :selected-count="selectedIssueIds.length"
          :statuses="batchActions"
          :note="batchNote"
          :loading="batchUpdating"
          :issues="issues"
          :mention-users="mentionCandidates.issue_internal"
          @update:note="emit('update:batchNote', $event)"
          @clear="emit('batchClear')"
          @apply="emit('batchApply', $event)"
        />

        <IssueMarkerList
          :issues="listIssues"
          :selectable="true"
          :selected-ids="selectedIssueIds"
          :current-source-version-number="displayedSourceVersionNumber"
          :hovered-issue-id="hoveredIssueId"
          :track="track"
          :assignments="reviewAssignments"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="emit('issueSelect', $event)"
          @update:selectedIds="emit('update:selectedIssueIds', $event)"
          @hover="emit('issueHover', $event)"
          @leave="emit('issueLeave')"
          @status-change="emit('quickStatusChange', $event)"
        />
      </div>

      <div
        v-if="checklistEnabled"
        class="card space-y-4"
        :class="checklistSaved ? '' : 'border-warning/60 ring-1 ring-warning/40'"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.checklistHeading') }}</h3>
          <span
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono"
            :class="checklistSaved ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'"
          >
            <CheckCircle2 v-if="checklistSaved" class="w-3.5 h-3.5" :stroke-width="2" />
            <AlertCircle v-else class="w-3.5 h-3.5" :stroke-width="2" />
            {{ checklistSaved ? t('peerReview.checklistSavedBadge') : t('peerReview.checklistRequiredBadge') }}
          </span>
        </div>
        <div v-if="checklistPrefill" class="border border-border bg-background p-3 space-y-1">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="font-mono text-foreground">{{ t('peerReview.prefillLabel') }}</span>
            <span
              v-if="checklistPrefillStateLabel"
              class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 font-mono text-info"
            >
              {{ checklistPrefillStateLabel }}
            </span>
            <span v-if="checklistPrefill.source_version_number != null" class="text-muted-foreground">
              {{ t('peerReview.prefillVersion', { version: checklistPrefill.source_version_number }) }}
            </span>
            <span v-if="checklistPrefill.updated_at" class="text-muted-foreground">
              {{ fmtDate(checklistPrefill.updated_at) }}
            </span>
          </div>
          <p v-if="checklistPrefill.reason" class="text-xs text-muted-foreground">
            {{ checklistPrefill.reason }}
          </p>
        </div>
        <div v-for="item in checklistDraft" :key="item.label" class="flex items-start gap-3">
          <input
            v-model="item.passed"
            type="checkbox"
            class="checkbox mt-1"
          />
          <div class="flex-1">
            <div class="text-sm text-foreground">{{ checklistLabel(item.label) }}</div>
            <input
              v-model="item.note"
              class="input-field w-full text-xs mt-1"
              :placeholder="t('common.notesOptionalPlaceholder')"
            />
          </div>
        </div>
        <button @click="emit('submitChecklist')" class="btn-secondary text-sm">
          {{ checklistSaveButtonLabel }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="checklistEnabled && !checklistSaved"
    class="mt-4 flex items-start gap-3 border border-warning/60 bg-warning-bg px-4 py-3 text-warning"
  >
    <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" :stroke-width="2" />
    <div class="space-y-0.5">
      <div class="text-sm font-sans font-semibold">{{ t('peerReview.checklistBlockerTitle') }}</div>
      <div class="text-xs text-muted-foreground">{{ t('peerReview.checklistBlockerDesc') }}</div>
    </div>
  </div>
</template>
