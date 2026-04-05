<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { extractTimeReferences, resolveTimeReferenceTarget, type TimestampTarget } from '@/utils/timestamps'

const props = withDefaults(defineProps<{
  text: string
  visible: boolean
  defaultTarget?: TimestampTarget
}>(), {
  defaultTarget: 'track',
})

const { t } = useI18n()

const matches = computed(() => extractTimeReferences(props.text))

function targetLabel(target: TimestampTarget) {
  return target === 'attachment' ? t('timestamp.attachmentAudio') : t('timestamp.trackAudio')
}

const examples = computed(() => ([
  { code: '03:15', description: t('timestamp.examples.point') },
  { code: '03:15-04:12', description: t('timestamp.examples.range') },
  { code: 't:03:15', description: t('timestamp.examples.track') },
  { code: 'a:03:15-04:12', description: t('timestamp.examples.attachment') },
]))
</script>

<template>
  <div
    v-if="visible"
    class="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-border bg-card p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
  >
    <div class="space-y-3">
      <div>
        <p class="text-xs font-mono font-semibold text-foreground">{{ t('timestamp.syntaxTitle') }}</p>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('timestamp.syntaxDescription') }}</p>
      </div>

      <div class="grid gap-2 sm:grid-cols-2">
        <div
          v-for="example in examples"
          :key="example.code"
          class="rounded-2xl border border-border bg-background px-3 py-2"
        >
          <code class="text-xs font-mono text-warning">{{ example.code }}</code>
          <p class="mt-1 text-xs text-muted-foreground">{{ example.description }}</p>
        </div>
      </div>

      <div v-if="matches.length" class="space-y-2">
        <p class="text-xs font-mono font-semibold text-foreground">{{ t('timestamp.detectedTitle') }}</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(match, index) in matches"
            :key="`${match.index}-${index}`"
            class="inline-flex items-center rounded-full bg-warning-bg px-2.5 py-1 text-xs font-mono text-warning"
          >
            {{ match.raw }}
            <span class="mx-1 text-warning/60">·</span>
            <span class="text-muted-foreground">{{ targetLabel(resolveTimeReferenceTarget(match, defaultTarget)) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
