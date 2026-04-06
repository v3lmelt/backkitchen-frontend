<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { checklistApi, trackApi, API_ORIGIN } from '@/api'
import type { ChecklistItem, ChecklistTemplateItem, Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import { useToast } from '@/composables/useToast'
import WorkflowActionBar from '@/components/workflow/WorkflowActionBar.vue'
import type { WorkflowAction } from '@/components/workflow/WorkflowActionBar.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { success: toastSuccess } = useToast()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const existingChecklist = ref<ChecklistItem[]>([])
const loading = ref(true)
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const error = ref('')

// Default labels used as fallback; translated for display via translateChecklistLabel()
const defaultChecklistLabelKeyMap: Record<string, string> = {
  'Arrangement': 'arrangement',
  'Balance': 'balance',
  'Low-End': 'lowEnd',
  'Stereo Image': 'stereoImage',
  'Technical Cleanliness': 'technicalCleanliness',
}

const templateItems = ref<ChecklistTemplateItem[]>([])

function translateChecklistLabel(label: string): string {
  const key = defaultChecklistLabelKeyMap[label]
  return key ? t(`checklistLabels.${key}`) : label
}

const checklist = ref<{ label: string; passed: boolean; note: string }[]>([])

const checklistSaved = computed(() => existingChecklist.value.length > 0)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues.filter(issue => issue.phase === 'peer' && issue.workflow_cycle === detail.track.workflow_cycle)
    existingChecklist.value = detail.checklist_items

    // Load checklist template from album
    try {
      const template = await checklistApi.getTemplate(detail.track.album_id)
      templateItems.value = template.items
    } catch {
      // Fallback to defaults if template fetch fails
      templateItems.value = [
        { label: 'Arrangement', required: true, sort_order: 0 },
        { label: 'Balance', required: true, sort_order: 1 },
        { label: 'Low-End', required: true, sort_order: 2 },
        { label: 'Stereo Image', required: true, sort_order: 3 },
        { label: 'Technical Cleanliness', required: true, sort_order: 4 },
      ]
    }

    const labels = templateItems.value
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => item.label)

    if (existingChecklist.value.length) {
      checklist.value = labels.map(label => {
        const item = existingChecklist.value.find(entry => entry.label === label)
        return { label, passed: item?.passed ?? false, note: item?.note ?? '' }
      })
    } else {
      checklist.value = labels.map(label => ({ label, passed: false, note: '' }))
    }
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio` : '')
const waveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return issues.value
  return issues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

async function submitChecklist() {
  error.value = ''
  try {
    existingChecklist.value = await checklistApi.submit(
      trackId.value,
      checklist.value.map(item => ({
        label: item.label,
        passed: item.passed,
        note: item.note || undefined,
      })),
    )
    toastSuccess(t('peerReview.checklistSubmitted'))
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
  }
}

async function finish(decision: 'needs_revision' | 'pass') {
  error.value = ''
  try {
    await trackApi.finishPeerReview(trackId.value, decision)
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
  }
}

function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
}

const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

const workflowActions = computed<WorkflowAction[]>(() => [
  {
    label: t('peerReview.requestRevision'),
    type: 'return',
    disabled: !checklistSaved.value,
    handler: () => finish('needs_revision'),
  },
  {
    label: t('peerReview.passToProducer'),
    type: 'advance',
    disabled: !checklistSaved.value,
    handler: () => finish('pass'),
  },
])
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('peerReview.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('peerReview.subheading', { version: track.version }) }}</p>
        </div>
        <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="error" class="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
        {{ error }}
      </div>

      <div v-if="audioUrl">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-muted-foreground">{{ t('peerReview.waveformHint') }}</p>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          :audio-url="audioUrl"
          :issues="waveformIssues"
          :selectable="true"
          :selected-range="issueFormRef?.selectedRange ?? null"
          @click="(t: number) => issueFormRef?.handleClick(t)"
          @regionClick="onIssueSelect"
          @rangeSelect="(s: number, e: number) => issueFormRef?.handleRangeSelect(s, e)"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <IssueCreatePanel
            ref="issueFormRef"
            :track-id="trackId"
            phase="peer"
            @created="(issue: Issue) => issues.push(issue)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.issuesHeading', { count: issues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <IssueMarkerList :issues="issues" :current-source-version-number="track.version" @select="onIssueSelect" />
        </div>

        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.checklistHeading') }}</h3>
          <div v-for="item in checklist" :key="item.label" class="flex items-start gap-3">
            <input
              type="checkbox"
              v-model="item.passed"
              class="checkbox mt-1"
            />
            <div class="flex-1">
              <div class="text-sm text-foreground">{{ translateChecklistLabel(item.label) }}</div>
              <input
                v-model="item.note"
                class="input-field w-full text-xs mt-1"
                :placeholder="t('common.notesOptionalPlaceholder')"
              />
            </div>
          </div>
          <button @click="submitChecklist" class="btn-secondary text-sm">
              {{ t('peerReview.saveChecklist') }}
            </button>
        </div>
      </div>
    </div>

    <WorkflowActionBar :actions="workflowActions" :hint="t('peerReview.actionHint')" />
  </div>
</template>
