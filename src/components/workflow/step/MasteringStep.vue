<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, Upload } from 'lucide-vue-next'
import type {
  Issue,
  IssueStatus,
  MasterDelivery,
  MentionCandidates,
  StageAssignment,
  Track,
  WorkflowConfig,
} from '@/types'
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
  // waveform + source compare
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
  // delivery upload
  deliveryMessage: string
  hasUploadFile: boolean
  localDeliveryPreviewUrl: string
  uploading: boolean
  uploadProgress: number
  canSubmitDelivery: boolean
  // current delivery + master compare
  masterDelivery: MasterDelivery | null
  masterAudioUrl: string
  hasComparableMasters: boolean
  showMasterCompare: boolean
  masterCompareOptions: SelectOption[]
  compareMasterDeliveryId: number | null
  compareMasterAudioUrl: string
  // history
  sortedMasterDeliveries: MasterDelivery[]
}>()

const emit = defineEmits<{
  back: []
  toggleSourceCompare: []
  'update:compareSourceVersionId': [value: number | null]
  download: []
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
  'update:deliveryMessage': [value: string]
  fileChange: [event: Event]
  uploadDelivery: []
  clearDelivery: []
  toggleMasterCompare: []
  'update:compareMasterDeliveryId': [value: number | null]
  downloadMaster: []
  compareDelivery: [delivery: MasterDelivery]
  downloadDelivery: [delivery: MasterDelivery]
}>()

const { t } = useI18n()

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
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('mastering.heading', { title: track.title }) }}</h1>
      </div>
      <button @click="emit('back')" class="btn-secondary !px-3 !py-2 flex-shrink-0 self-start" :aria-label="t('common.backToTrack')" :title="t('common.backToTrack')">
        <ChevronLeft class="w-4 h-4" />
      </button>
    </div>

    <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div v-if="audioUrl">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-muted-foreground leading-relaxed">{{ t('mastering.waveformHint') }}</p>
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
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <IssueCreatePanel
          :ref="bindIssueForm"
          :track-id="trackId"
          phase="mastering"
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
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: listIssues.length }) }}</h3>
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

      <div class="card space-y-4">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.actionsHeading') }}</h3>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryFileLabel') }}</label>
          <input type="file" accept="audio/*" @change="emit('fileChange', $event)" class="input-field w-full" />
        </div>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryMessageLabel') }}</label>
          <textarea
            :value="deliveryMessage"
            class="textarea-field min-h-[120px]"
            :placeholder="t('workflowStep.deliveryMessagePlaceholder')"
            :disabled="uploading"
            @input="emit('update:deliveryMessage', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
          <p class="text-xs text-muted-foreground">{{ t('workflowStep.deliveryMessageHint') }}</p>
        </div>
        <div v-if="hasUploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
          </div>
          <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" :compact="true" :height="96" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            @click="emit('uploadDelivery')"
            :disabled="uploading || !canSubmitDelivery"
            class="btn-primary text-sm h-10 inline-flex items-center justify-center"
          >
            <Upload class="w-4 h-4 mr-2" />
            {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
          </button>
          <button
            v-if="hasUploadFile"
            @click="emit('clearDelivery')"
            :disabled="uploading"
            class="btn-secondary text-sm"
          >
            {{ t('workflowStep.clearSelectedDelivery') }}
          </button>
        </div>
        <div v-if="uploading" class="space-y-1">
          <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
        </div>
      </div>
    </div>

    <div v-if="masterDelivery" class="card space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.currentDelivery') }}</h3>
          <p class="text-xs text-muted-foreground mt-1">
            {{ masterDelivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
          </p>
        </div>
        <div v-if="masterAudioUrl" class="flex items-center gap-2 shrink-0">
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
      <div v-if="showMasterCompare && hasComparableMasters" class="flex items-center gap-2">
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
      <div v-if="masterDelivery.delivery_message" class="border border-border bg-background rounded-none p-3">
        <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
        <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ masterDelivery.delivery_message }}</p>
      </div>
      <WaveformPlayer v-if="masterAudioUrl" :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" :compare-audio-url="compareMasterAudioUrl" />
      <p v-else class="text-sm text-muted-foreground">{{ t('workflowStep.textDeliveryNoAudio') }}</p>
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
