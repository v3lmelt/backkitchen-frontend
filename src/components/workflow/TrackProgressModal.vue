<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { trackApi } from '@/api'
import type { Track, WorkflowConfig } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'
import { progressOptions, progressRequiresReason } from '@/utils/trackProgress'
import { translateWorkflowStatusLabel } from '@/utils/workflow'

const props = defineProps<{ track: Track; config: WorkflowConfig | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, te } = useI18n()
const target = ref('')
const reason = ref('')
const confirming = ref(false)
const saving = ref(false)
const error = ref('')
const options = computed(() => progressOptions(props.config, t))
const needsReason = computed(() => progressRequiresReason(props.config, props.track.status, target.value))
const valid = computed(() => target.value && target.value !== props.track.status && (!needsReason.value || reason.value.trim()))
const message = computed(() => t('albumSettings.progress.confirmMessage', {
  track: props.track.title,
  from: translateWorkflowStatusLabel(props.track.status, props.config, t, te),
  to: options.value.find(option => option.value === target.value)?.label ?? target.value,
}))
async function save() {
  if (!valid.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await trackApi.forceStatus(props.track.id, { new_status: target.value, reason: reason.value })
    emit('saved')
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
    confirming.value = false
  } finally { saving.value = false }
}
</script>

<template>
  <BaseModal :aria-label="t('albumSettings.progress.title')" :closable="!saving" @close="!saving && emit('close')">
    <div class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground pr-6">{{ t('albumSettings.progress.title') }}</h3>
      <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
      <template v-if="!confirming">
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">{{ t('albumSettings.progress.targetStatus') }}</span>
          <select v-model="target" class="select-field w-full">
            <option value="" disabled>{{ t('albumSettings.progress.selectStatus') }}</option>
            <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.value === track.status">{{ option.label }}</option>
          </select>
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">{{ t('albumSettings.progress.reason') }}</span>
          <input v-model="reason" class="input-field w-full" :placeholder="t('albumSettings.progress.reasonPlaceholder')" />
        </label>
        <p v-if="needsReason" class="text-xs text-warning">{{ t('albumSettings.progress.reasonRequiredHint') }}</p>
      </template>
      <p v-else class="text-sm text-muted-foreground">{{ message }}</p>
      <div class="flex justify-end gap-3">
        <button class="btn-secondary" :disabled="saving" @click="confirming ? confirming = false : emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn-primary" :disabled="!valid || saving" @click="confirming ? save() : confirming = true">
          {{ saving ? t('common.loading') : confirming ? t('albumSettings.progress.confirmAction') : t('albumSettings.progress.save') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
