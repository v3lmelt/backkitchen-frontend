<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import type { Issue } from '@/types'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const props = defineProps<{
  trackId: number
  phase: 'peer' | 'producer' | 'mastering' | 'final_review'
  masterDeliveryId?: number | null
}>()

const emit = defineEmits<{
  created: [issue: Issue]
}>()

const { t } = useI18n()

const showForm = ref(false)
const newIssue = ref(makeBlank())
const descriptionInputFocused = ref(false)

function makeBlank() {
  return {
    title: '',
    description: '',
    severity: 'major' as 'critical' | 'major' | 'minor' | 'suggestion',
    issue_type: 'point' as 'point' | 'range',
    time_start: 0,
    time_end: null as number | null,
    phase: props.phase,
  }
}

const selectedRange = computed(() => {
  if (newIssue.value.issue_type === 'range' && showForm.value && newIssue.value.time_end !== null) {
    return { start: newIssue.value.time_start, end: newIssue.value.time_end }
  }
  return null
})

function handleClick(time: number) {
  newIssue.value.issue_type = 'point'
  newIssue.value.time_start = roundToMilliseconds(time)
  newIssue.value.time_end = null
  showForm.value = true
}

function handleRangeSelect(start: number, end: number) {
  newIssue.value.issue_type = 'range'
  newIssue.value.time_start = start
  newIssue.value.time_end = end
  showForm.value = true
}

async function submitIssue() {
  const payload: Record<string, unknown> = { ...newIssue.value }
  if (props.masterDeliveryId != null) {
    payload.master_delivery_id = props.masterDeliveryId
  }
  const created = await issueApi.create(props.trackId, payload as any)
  emit('created', created)
  showForm.value = false
  newIssue.value = makeBlank()
}

watch(() => newIssue.value.issue_type, (type) => {
  if (type === 'point') newIssue.value.time_end = null
})

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

defineExpose({ handleClick, handleRangeSelect, selectedRange, showForm })
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <slot name="heading" />
      <button @click="showForm = !showForm" class="btn-primary text-xs">
        {{ t('common.addIssue') }}
      </button>
    </div>

    <div v-if="showForm" class="card space-y-3 border-primary/50">
      <h4 class="text-sm font-sans font-semibold text-foreground">
        {{ t('common.newIssueAt', { time: formatTime(newIssue.time_start) }) }}
      </h4>
      <input v-model="newIssue.title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
      <div class="relative">
        <textarea
          v-model="newIssue.description"
          class="textarea-field w-full h-20"
          :placeholder="t('common.descriptionPlaceholder')"
          @focus="descriptionInputFocused = true"
          @blur="descriptionInputFocused = false"
        />
        <TimestampSyntaxPopover
          :visible="descriptionInputFocused"
          :text="newIssue.description"
          default-target="track"
        />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select v-model="newIssue.severity" class="select-field">
          <option value="critical">{{ t('severity.critical') }}</option>
          <option value="major">{{ t('severity.major') }}</option>
          <option value="minor">{{ t('severity.minor') }}</option>
          <option value="suggestion">{{ t('severity.suggestion') }}</option>
        </select>
        <select v-model="newIssue.issue_type" class="select-field">
          <option value="point">{{ t('issueType.point') }}</option>
          <option value="range">{{ t('issueType.range') }}</option>
        </select>
      </div>
      <div v-if="newIssue.issue_type === 'range'" class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-muted-foreground">{{ t('common.rangeStart') }}</label>
          <input v-model.number="newIssue.time_start" type="number" step="0.001" class="input-field w-full" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground">{{ t('common.rangeEnd') }}</label>
          <input v-model.number="newIssue.time_end" type="number" step="0.001" class="input-field w-full" />
        </div>
      </div>
      <div class="flex gap-2">
        <button @click="submitIssue" class="btn-primary text-sm">{{ t('common.submitIssue') }}</button>
        <button @click="showForm = false" class="btn-secondary text-sm">{{ t('common.cancel') }}</button>
      </div>
    </div>
  </div>
</template>
