<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft } from 'lucide-vue-next'
import type {
  Issue,
  IssueStatus,
  MasterDelivery,
  MentionCandidates,
  StageAssignment,
  Track,
  WorkflowConfig,
} from '@/types'
import { formatLocaleDate } from '@/utils/time'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import MasterDeliveryHistoryCard from '@/components/workflow/step/MasterDeliveryHistoryCard.vue'

const props = defineProps<{
  track: Track
  workflowConfig: WorkflowConfig | null
  error: string
  // master waveform + compare
  masterAudioUrl: string
  masterDelivery: MasterDelivery | null
  trackId: number
  hasComparableMasters: boolean
  showMasterCompare: boolean
  masterCompareOptions: SelectOption[]
  compareMasterDeliveryId: number | null
  compareMasterAudioUrl: string
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
  finalReviewIssues: Issue[]
  reviewAssignments: StageAssignment[]
  batchUpdating: boolean
  batchActions: IssueStatus[]
  selectedIssueIds: number[]
  batchNote: string
  // approval status
  composerApprovalLabel: string
  // history
  sortedMasterDeliveries: MasterDelivery[]
}>()

const emit = defineEmits<{
  back: []
  toggleMasterCompare: []
  'update:compareMasterDeliveryId': [value: number | null]
  downloadMaster: []
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
  compareDelivery: [delivery: MasterDelivery]
  downloadDelivery: [delivery: MasterDelivery]
}>()

const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

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
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('finalReview.heading', { title: track.title }) }}</h1>
        <p class="text-sm sm:text-base text-muted-foreground">{{ t('finalReview.subheading') }}</p>
      </div>
      <button @click="emit('back')" class="btn-secondary !px-3 !py-2 flex-shrink-0 self-start" :aria-label="t('common.backToTrack')" :title="t('common.backToTrack')">
        <ChevronLeft class="w-4 h-4" />
      </button>
    </div>

    <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div v-if="masterAudioUrl">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-muted-foreground leading-relaxed">{{ t('finalReview.waveformHint') }}</p>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="hasComparableMasters"
            @click="emit('toggleMasterCompare')"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="emit('downloadMaster')" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
      <div v-if="showMasterCompare && hasComparableMasters" class="flex items-center gap-2 mb-3">
        <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
        <CustomSelect
          :model-value="compareMasterDeliveryId"
          :options="masterCompareOptions"
          :placeholder="`-- ${t('compare.selectVersion')} --`"
          size="sm"
          @update:model-value="emit('update:compareMasterDeliveryId', $event)"
        />
        <button
          v-if="compareMasterDeliveryId"
          @click="emit('update:compareMasterDeliveryId', null)"
          class="text-xs text-muted-foreground hover:text-foreground"
        >
          {{ t('compare.clear') }}
        </button>
      </div>
      <div v-if="masterDelivery?.delivery_message" class="border border-border bg-background rounded-none p-3 mb-3">
        <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
        <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ masterDelivery.delivery_message }}</p>
      </div>
      <WaveformPlayer
        :ref="registerWaveform"
        :audio-url="masterAudioUrl"
        :compare-audio-url="compareMasterAudioUrl"
        :issues="finalReviewIssues"
        :track-id="trackId"
        playback-scope="master"
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
    <div v-else-if="masterDelivery" class="card space-y-3">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.currentDelivery') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('workflowStep.textDeliveryNoAudio') }}</p>
      <div v-if="masterDelivery.delivery_message" class="border border-border bg-background rounded-none p-3">
        <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
        <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ masterDelivery.delivery_message }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <IssueCreatePanel
          :ref="bindIssueForm"
          :track-id="trackId"
          phase="final_review"
          :allow-internal-visibility="false"
          :master-delivery-id="masterDelivery?.id ?? null"
          :issues="issues"
          :mention-users="mentionCandidates.issue_public"
          :form-open="formOpen"
          @created="emit('issueCreated', $event)"
          @formOpenChange="emit('update:formOpen', $event)"
        >
          <template #heading>
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.issuesHeading', { count: finalReviewIssues.length }) }}</h3>
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
          :issues="finalReviewIssues"
          :selectable="true"
          :selected-ids="selectedIssueIds"
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

      <div class="card space-y-4">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.approvalStatus') }}</h3>
        <div class="flex items-center justify-between gap-3 text-sm">
          <span>{{ t('finalReview.producer') }}</span>
          <span
            :class="masterDelivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'"
            class="text-right"
          >
            <template v-if="masterDelivery?.producer_approved_at">
              {{ t('common.approved') }}
              <span class="ml-1 font-mono text-xs text-muted-foreground">{{ fmtDate(masterDelivery.producer_approved_at) }}</span>
            </template>
            <template v-else>{{ t('common.pending') }}</template>
          </span>
        </div>
        <div class="flex items-center justify-between gap-3 text-sm">
          <span>{{ composerApprovalLabel }}</span>
          <span
            :class="masterDelivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'"
            class="text-right"
          >
            <template v-if="masterDelivery?.submitter_approved_at">
              {{ t('common.approved') }}
              <span class="ml-1 font-mono text-xs text-muted-foreground">{{ fmtDate(masterDelivery.submitter_approved_at) }}</span>
            </template>
            <template v-else>{{ t('common.pending') }}</template>
          </span>
        </div>
      </div>
    </div>

    <MasterDeliveryHistoryCard
      v-if="sortedMasterDeliveries.length > 0"
      :deliveries="sortedMasterDeliveries"
      :current-delivery-id="masterDelivery?.id ?? null"
      :downloading="downloading"
      :download-progress="downloadProgress"
      @compare="emit('compareDelivery', $event)"
      @download="emit('downloadDelivery', $event)"
    />
  </div>
</template>
