<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/common/BaseModal.vue'
import type { AudioSpecCheck } from '@/types'
defineProps<{ check: AudioSpecCheck | null }>()
const emit = defineEmits<{ answer: [accepted: boolean] }>()
const { t } = useI18n()
function format(field: string, value: string | number | null) {
  if (value == null) return '—'
  if (field === 'sample_rate_hz') return `${Number(value) / 1000} kHz`
  if (field === 'sample_format') return t(`audioAnalysis.sampleFormats.${value}`, String(value))
  return String(value).toUpperCase()
}
</script>

<template>
  <BaseModal :aria-label="t('audioSpecs.mismatch')" v-if="check" @close="emit('answer', false)">
    <div class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('audioSpecs.mismatch') }}</h3>
      <div v-for="difference in check.differences" :key="difference.field" class="border-b border-border pb-3 text-sm">
        <div class="mb-1 text-muted-foreground">{{ t(`audioSpecs.fields.${difference.field}`) }}</div>
        <div>{{ t('audioSpecs.actual') }}: {{ format(difference.field, difference.actual) }}</div>
        <div class="text-muted-foreground">{{ t('audioSpecs.required') }}: {{ difference.allowed.map(value => format(difference.field, value)).join(' / ') }}</div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" @click="emit('answer', false)">{{ t('common.cancel') }}</button>
        <button class="btn-primary" @click="emit('answer', true)">{{ t('audioSpecs.continue') }}</button>
      </div>
    </div>
  </BaseModal>
</template>
