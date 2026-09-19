<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { trackApi } from '@/api'
import type { ReviewerCandidate, StageAssignment, Track, WorkflowConfig } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'
import { activeAssignmentsForStep } from '@/utils/reviewAssignments'
import { previewFlexibleReview } from '@/utils/flexibleReview'
import { translateWorkflowStatusLabel } from '@/utils/workflow'

const props = defineProps<{ trackId: number }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, te } = useI18n()
const track = ref<Track | null>(null)
const config = ref<WorkflowConfig | null>(null)
const assignments = ref<StageAssignment[]>([])
const candidates = ref<ReviewerCandidate[]>([])
const selected = ref<number[]>([])
const enabled = ref(false)
const loading = ref(true)
const saving = ref(false)
const confirming = ref(false)
const error = ref('')
const conflict = ref(false)
const search = ref('')
const preview = computed(() => previewFlexibleReview(selected.value, assignments.value, track.value?.workflow_step))
const rows = computed(() => {
  const result = candidates.value.map(candidate => ({ id: candidate.user_id, name: candidate.user.display_name, eligible: true }))
  for (const assignment of assignments.value) {
    if (!result.some(row => row.id === assignment.user_id)) result.push({ id: assignment.user_id, name: assignment.user?.display_name ?? `#${assignment.user_id}`, eligible: false })
  }
  return result.filter(row => row.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))
})
const valid = computed(() => enabled.value && selected.value.length > 0 && !loading.value && !conflict.value
  && selected.value.every(id => candidates.value.some(candidate => candidate.user_id === id)))
const outcome = computed(() => {
  const target = preview.value.target
  if (!target) return t('flexibleReview.waiting', { completed: preview.value.completed, total: selected.value.length })
  return t('flexibleReview.advance', { target: translateWorkflowStatusLabel(target === '__completed' ? 'completed' : target, config.value, t, te) })
})
function names(ids: number[]) {
  return ids.map(id => candidates.value.find(candidate => candidate.user_id === id)?.user.display_name
    ?? assignments.value.find(assignment => assignment.user_id === id)?.user?.display_name ?? `#${id}`).join('、')
}
async function load() {
  loading.value = true
  confirming.value = false
  error.value = ''
  conflict.value = false
  try {
    // Read the version before the roster: any subsequent change makes saving conflict.
    const detail = await trackApi.get(props.trackId)
    const [members, history] = await Promise.all([trackApi.listReviewerCandidates(props.trackId), trackApi.listAssignments(props.trackId)])
    if (!detail.track.viewer_can_manage_review || !detail.track.review_state?.flexible_available) {
      throw new Error(t('flexibleReview.unavailable'))
    }
    track.value = detail.track
    config.value = detail.workflow_config ?? null
    candidates.value = members
    assignments.value = activeAssignmentsForStep(history, detail.track.review_state.step_id)
    selected.value = assignments.value.map(assignment => assignment.user_id)
    enabled.value = detail.track.review_state.flexible === true
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
    conflict.value = true
  } finally { loading.value = false }
}
async function save() {
  if (!valid.value || saving.value || !track.value?.review_state?.state_version) return
  saving.value = true
  error.value = ''
  try {
    await trackApi.manageReview(props.trackId, {
      stage_id: track.value.review_state.step_id, flexible: true,
      user_ids: selected.value, state_version: track.value.review_state.state_version,
    })
    emit('saved')
  } catch (err: any) {
    // A new review may have arrived; require a fresh snapshot and another preview.
    error.value = t('flexibleReview.refreshRequired') + ' ' + (err.message || '')
    conflict.value = true
    confirming.value = false
  } finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <BaseModal :aria-label="t('flexibleReview.title')" :closable="!saving" @close="!saving && emit('close')">
    <div class="space-y-4 max-h-[80dvh] overflow-y-auto">
      <h3 class="text-sm font-mono font-semibold text-foreground pr-6">{{ t('flexibleReview.title') }}</h3>
      <p v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
      <div v-if="error" role="alert" class="space-y-2">
        <p class="text-sm text-error">{{ error }}</p>
        <button class="btn-secondary" :disabled="loading || saving" @click="load">{{ t('common.retry') }}</button>
      </div>
      <template v-if="track && !loading && !conflict">
        <template v-if="!confirming">
          <label class="flex items-center gap-2 text-sm text-foreground">
            <input v-model="enabled" type="checkbox" class="checkbox" :disabled="track.review_state?.flexible" />
            {{ t('flexibleReview.enable') }}
          </label>
          <p v-if="!track.review_state?.flexible" class="text-xs text-muted-foreground">{{ t('flexibleReview.enableHint') }}</p>
          <template v-if="enabled">
            <input v-model="search" class="input-field w-full" :aria-label="t('flexibleReview.search')" :placeholder="t('flexibleReview.search')" />
            <div class="max-h-64 overflow-y-auto divide-y divide-border">
              <label v-for="row in rows" :key="row.id" class="flex items-center gap-3 py-3 text-sm text-foreground">
                <input v-model="selected" type="checkbox" class="checkbox" :value="row.id" :disabled="!row.eligible && !selected.includes(row.id)" />
                <span class="flex-1 min-w-0 truncate">{{ row.name }}</span>
                <span class="text-xs text-muted-foreground">{{ !row.eligible ? t('flexibleReview.ineligible') : assignments.find(a => a.user_id === row.id)?.status === 'completed' ? t('trackDetail.reviewDone') : '' }}</span>
              </label>
              <p v-if="rows.length === 0" class="text-xs text-muted-foreground py-3">{{ t('flexibleReview.noCandidates') }}</p>
            </div>
            <p class="text-xs text-muted-foreground">{{ t('flexibleReview.selected', { count: selected.length }) }}</p>
          </template>
        </template>
        <template v-else>
          <p v-if="!track.review_state?.flexible" class="text-sm text-muted-foreground">{{ t('flexibleReview.enableHint') }}</p>
          <p v-if="preview.added.length" class="text-sm text-foreground">{{ t('flexibleReview.added') }}：{{ names(preview.added) }}</p>
          <p v-if="preview.removed.length" class="text-sm text-foreground">{{ t('flexibleReview.removed') }}：{{ names(preview.removed) }}</p>
          <p v-if="preview.removed.length" class="text-xs text-muted-foreground">{{ t('flexibleReview.removalHint') }}</p>
          <p class="text-sm" :class="preview.target ? 'text-warning' : 'text-muted-foreground'">{{ outcome }}</p>
        </template>
      </template>
      <div class="flex justify-end gap-3">
        <button class="btn-secondary" :disabled="saving" @click="confirming ? confirming = false : emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn-primary" :disabled="!valid || saving" @click="confirming ? save() : confirming = true">{{ saving ? t('common.loading') : confirming ? t('common.confirm') : t('flexibleReview.preview') }}</button>
      </div>
    </div>
  </BaseModal>
</template>
