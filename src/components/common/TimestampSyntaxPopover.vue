<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info } from 'lucide-vue-next'
import { extractTimeReferences, resolveTimeReferenceTarget, type TimestampTarget } from '@/utils/timestamps'

const props = withDefaults(defineProps<{
  text: string
  cursorPos?: number
  defaultTarget?: TimestampTarget
}>(), {
  defaultTarget: 'track',
  cursorPos: 0,
})

const { t } = useI18n()

const manualOpen = ref(false)

// Check whether the cursor is near a timestamp-like pattern.
// Uses a small window instead of whitespace-delimited words so that CJK text
// (which has no spaces between words) doesn't keep the popover open forever.
const typingTimestamp = computed(() => {
  const pos = props.cursorPos ?? props.text.length
  const start = Math.max(0, pos - 10)
  const end = Math.min(props.text.length, pos + 10)
  const nearby = props.text.slice(start, end)
  // Match timestamp patterns: "03:15", "03:", "t:03:15", "a:1:23", etc.
  return /(?:[ta]:)?\d{1,2}:\d{0,2}/.test(nearby)
})
const matches = computed(() => extractTimeReferences(props.text))
const isVisible = computed(() => manualOpen.value || typingTimestamp.value)

function toggleManual() {
  manualOpen.value = !manualOpen.value
}

function targetLabel(target: TimestampTarget) {
  return target === 'attachment' ? t('timestamp.attachmentAudio') : t('timestamp.trackAudio')
}

const examples = computed(() => ([
  { code: '03:15', description: t('timestamp.examples.point') },
  { code: '03:15-04:12', description: t('timestamp.examples.range') },
  { code: 't:03:15', description: t('timestamp.examples.track') },
  { code: 'a:03:15', description: t('timestamp.examples.attachment') },
]))
</script>

<template>
  <!-- Toggle button: sits in the bottom-right corner of the textarea (positioned by parent) -->
  <button
    type="button"
    @mousedown.prevent="toggleManual"
    class="absolute bottom-2 right-2.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors"
    :class="manualOpen
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'"
    :title="t('timestamp.syntaxTitle')"
  >
    <Info class="h-3 w-3" :stroke-width="2.5" />
  </button>

  <!-- Popover -->
  <Transition
    enter-active-class="transition-all duration-150 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-100 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <div
      v-if="isVisible"
      class="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span class="text-[11px] font-mono font-semibold text-muted-foreground shrink-0">{{ t('timestamp.syntaxTitle') }}</span>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="ex in examples"
            :key="ex.code"
            class="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5"
            :title="ex.description"
          >
            <code class="text-[11px] font-mono text-warning">{{ ex.code }}</code>
            <span class="text-[10px] text-muted-foreground">{{ ex.description }}</span>
          </span>
        </div>
      </div>

      <div v-if="matches.length" class="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
        <span
          v-for="(match, index) in matches"
          :key="`${match.index}-${index}`"
          class="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-mono text-warning"
        >
          {{ match.raw }}
          <span class="text-warning/50">·</span>
          <span class="text-muted-foreground">{{ targetLabel(resolveTimeReferenceTarget(match, defaultTarget)) }}</span>
        </span>
      </div>
    </div>
  </Transition>
</template>
