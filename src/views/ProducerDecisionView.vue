<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi } from '@/api'
import type { ChecklistItem, Issue, Track } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const checklist = ref<ChecklistItem[]>([])
const loading = ref(true)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues.filter(issue => issue.workflow_cycle === detail.track.workflow_cycle)
    checklist.value = detail.checklist_items
  } finally {
    loading.value = false
  }
}

const isSubmittedState = computed(() => track.value?.status === 'submitted')
const isMasteringGateState = computed(() => track.value?.status === 'producer_mastering_gate')

async function handleIntake(decision: 'accept' | 'reject_final' | 'reject_resubmittable') {
  await trackApi.intakeDecision(trackId.value, decision)
  router.push(`/tracks/${trackId.value}`)
}

async function handleGate(decision: 'send_to_mastering' | 'request_peer_revision') {
  await trackApi.producerGate(trackId.value, decision)
  router.push(`/tracks/${trackId.value}`)
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
        <p class="text-muted-foreground">{{ t('producer.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <WorkflowProgress :status="track.status" />

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-foreground">{{ issues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ issues.filter(issue => issue.status === 'open').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ issues.filter(issue => issue.status === 'resolved').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary">{{ checklist.filter(item => item.passed).length }}/{{ checklist.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.checklistPassed') }}</div>
      </div>
    </div>

    <div v-if="isSubmittedState" class="card space-y-4 border-primary/50">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.intakeHeading') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('producer.intakeDesc') }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button @click="handleIntake('accept')" class="btn-primary text-sm">{{ t('producer.acceptAndAssign') }}</button>
        <button @click="handleIntake('reject_final')" class="btn-secondary text-sm">{{ t('producer.rejectFinal') }}</button>
        <button @click="handleIntake('reject_resubmittable')" class="btn-secondary text-sm">{{ t('producer.rejectResubmittable') }}</button>
      </div>
    </div>

    <template v-if="isMasteringGateState">
      <div v-if="checklist.length > 0" class="card">
        <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.checklistHeading') }}</h3>
        <div class="space-y-2">
          <div v-for="item in checklist" :key="item.id" class="flex items-center gap-3 text-sm">
            <span :class="item.passed ? 'text-success' : 'text-error'">
              {{ item.passed ? 'OK' : 'NG' }}
            </span>
            <span class="text-foreground">{{ item.label }}</span>
            <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.issueSummaryHeading') }}</h3>
        <div class="space-y-2">
          <div v-for="issue in issues" :key="issue.id" class="flex items-center justify-between py-1">
            <div class="flex items-center gap-2">
              <StatusBadge :status="issue.phase" type="phase" />
              <StatusBadge :status="issue.severity" type="severity" />
              <span class="text-sm text-foreground">{{ issue.title }}</span>
            </div>
            <StatusBadge :status="issue.status" type="issue" />
          </div>
          <div v-if="issues.length === 0" class="text-sm text-muted-foreground">{{ t('producer.noIssues') }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button @click="handleGate('send_to_mastering')" class="btn-primary text-sm py-3">
          {{ t('producer.sendToMastering') }}
        </button>
        <button @click="handleGate('request_peer_revision')" class="btn-secondary text-sm py-3">
          {{ t('producer.requestRevision') }}
        </button>
      </div>
    </template>
  </div>
</template>
