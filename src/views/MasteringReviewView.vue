<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi } from '@/api'
import type { Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const masterFile = ref<File | null>(null)
const uploading = ref(false)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues.filter(issue => issue.phase === 'mastering' && issue.workflow_cycle === detail.track.workflow_cycle)
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  waveformRef.value?.highlightIssue(issue)
}

async function requestRevision() {
  await trackApi.requestMasteringRevision(trackId.value)
  router.push(`/tracks/${trackId.value}`)
}

function onMasterFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  masterFile.value = input.files?.[0] || null
}

async function uploadMasterDelivery() {
  if (!masterFile.value) return
  uploading.value = true
  try {
    await trackApi.uploadMasterDelivery(trackId.value, masterFile.value)
    router.push(`/tracks/${trackId.value}`)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('mastering.heading', { title: track.title }) }}</h1>
        <p class="text-muted-foreground">{{ t('mastering.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <div v-if="audioUrl">
      <p class="text-xs text-muted-foreground mb-2">{{ t('mastering.waveformHint') }}</p>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="issues"
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
          phase="mastering"
          @created="(issue: Issue) => issues.push(issue)"
        >
          <template #heading>
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: issues.length }) }}</h3>
          </template>
        </IssueCreatePanel>

        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.actionsHeading') }}</h3>
        <button @click="requestRevision" class="btn-secondary text-sm w-full">
          {{ t('mastering.requestRevision') }}
        </button>
        <div class="border-t border-border pt-4 space-y-3">
          <div class="text-sm text-muted-foreground">{{ t('mastering.uploadReady') }}</div>
          <input type="file" accept="audio/*" @change="onMasterFileSelect" class="input-field w-full" />
          <button
            @click="uploadMasterDelivery"
            :disabled="!masterFile || uploading"
            :class="[
              'w-full text-sm font-medium px-4 py-3 rounded-full transition-colors',
              !masterFile || uploading ? 'bg-border text-muted-foreground cursor-not-allowed' : 'btn-primary'
            ]"
          >
            {{ uploading ? t('mastering.uploading') : t('mastering.uploadMaster') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
