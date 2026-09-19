<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AudioSpec, AudioSpecs, PremasterSampleFormat } from '@/types'
const props = defineProps<{ value?: AudioSpecs; trackMode?: boolean; disabled?: boolean; saving?: boolean }>()
const emit = defineEmits<{ save: [value: AudioSpecs] }>()
const { t } = useI18n()
const kinds = ['source', 'master'] as const
const rates = [44100, 48000, 88200, 96000, 176400, 192000]
const formats: PremasterSampleFormat[] = ['pcm_s16', 'pcm_s24', 'pcm_s32', 'pcm_f32']
const modes = ref<Record<'source' | 'master', string>>({ source: 'disabled', master: 'disabled' })
const drafts = ref<Record<'source' | 'master', AudioSpec>>({ source: defaults(), master: defaults() })
const invalid = ref(false)
function defaults(): AudioSpec {
  return { enabled: false, allowed_containers: ['wav'], allowed_sample_rates_hz: [48000], allowed_sample_formats: ['pcm_s24'] }
}
watch(() => props.value, value => {
  for (const kind of kinds) {
    const spec = value?.[kind]
    modes.value[kind] = !spec && props.trackMode ? 'inherit' : spec?.enabled ? 'custom' : 'disabled'
    drafts.value[kind] = spec ? JSON.parse(JSON.stringify(spec)) : defaults()
  }
  invalid.value = false
}, { immediate: true, deep: true })
function save() {
  const payload: AudioSpecs = {}
  for (const kind of kinds) {
    const draft = drafts.value[kind]
    if (modes.value[kind] === 'custom' && (!draft.allowed_sample_rates_hz.length || !draft.allowed_sample_formats.length)) {
      invalid.value = true
      return
    }
    payload[kind] = modes.value[kind] === 'inherit' ? null : { ...draft, enabled: modes.value[kind] === 'custom' }
  }
  invalid.value = false
  emit('save', payload)
}
</script>

<template>
  <div class="space-y-5">
    <fieldset v-for="kind in kinds" :key="kind" :disabled="disabled || saving" class="space-y-3">
      <legend class="mb-3 text-sm font-mono font-semibold">{{ t(`audioSpecs.${kind}`) }}</legend>
      <select v-model="modes[kind]" class="select-field" :aria-label="t(`audioSpecs.${kind}`)">
        <option v-if="trackMode" value="inherit">{{ t('audioSpecs.inherit') }}</option>
        <option value="disabled">{{ t('audioSpecs.disabled') }}</option>
        <option value="custom">{{ t('audioSpecs.custom') }}</option>
      </select>
      <template v-if="modes[kind] === 'custom'">
        <p class="text-xs text-muted-foreground">WAV</p>
        <div class="flex flex-wrap gap-4">
          <label v-for="rate in rates" :key="rate" class="inline-flex items-center gap-2 text-sm">
            <input v-model="drafts[kind].allowed_sample_rates_hz" type="checkbox" class="checkbox" :value="rate" />{{ rate / 1000 }} kHz
          </label>
        </div>
        <div class="flex flex-wrap gap-4">
          <label v-for="format in formats" :key="format" class="inline-flex items-center gap-2 text-sm">
            <input v-model="drafts[kind].allowed_sample_formats" type="checkbox" class="checkbox" :value="format" />{{ t(`audioAnalysis.sampleFormats.${format}`) }}
          </label>
        </div>
      </template>
    </fieldset>
    <p v-if="invalid" class="text-xs text-error">{{ t('audioSpecs.selectionRequired') }}</p>
    <button v-if="!disabled" class="btn-primary" :disabled="saving" @click="save">{{ t(saving ? 'settings.saving' : 'common.save') }}</button>
  </div>
</template>
