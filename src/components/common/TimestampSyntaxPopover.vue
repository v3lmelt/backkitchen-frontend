<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Info } from 'lucide-vue-next'
import {
  extractMarkerIndexReferences,
  extractTimeReferences,
  resolveTimeReferenceTarget,
  type TimestampTarget,
} from '@/utils/timestamps'

const props = withDefaults(defineProps<{
  text: string
  cursorPos?: number
  defaultTarget?: TimestampTarget
  visible?: boolean
}>(), {
  defaultTarget: 'track',
  cursorPos: 0,
  visible: false,
})

const { t } = useI18n()

const manualOpen = ref(false)
// Set when the user explicitly closes the popover while it's auto-showing due to
// a timestamp pattern. Cleared automatically once the cursor moves away from any
// timestamp so the auto-show can trigger again next time.
const userClosed = ref(false)

// Check whether the cursor is currently sitting inside or immediately after a
// timestamp token. We can't just regex over a rolling window — in short CJK
// text (no whitespace) the whole string fits in the window and the popover
// would never close. So we find real timestamps via extractTimeReferences and
// also allow a small "in-progress" match right at the cursor for partial input
// like "03:" before the second digits are typed.
const typingTimestamp = computed(() => {
  const cursor = props.cursorPos ?? props.text.length
  // 1. Full, valid timestamps: is cursor inside or immediately after one?
  for (const ref of extractTimeReferences(props.text)) {
    const start = ref.index
    const end = ref.index + ref.length
    if (cursor >= start && cursor <= end) return true
  }
  // 2. In-progress partial timestamp ending exactly at the cursor.
  const snippet = props.text.slice(Math.max(0, cursor - 8), cursor)
  return /(?:^|[^\w])(?:[ta]:)?\d{1,2}:\d{0,2}$/.test(snippet)
})
const matches = computed(() => extractTimeReferences(props.text))
const markerMatches = computed(() => extractMarkerIndexReferences(props.text))
const isVisible = computed(() => props.visible || manualOpen.value || (typingTimestamp.value && !userClosed.value))

// Once the cursor moves away from a timestamp, reset userClosed so the popover
// can auto-show again the next time the user types near a timestamp.
watch(typingTimestamp, (val) => {
  if (!val) userClosed.value = false
})

function toggleManual() {
  if (isVisible.value) {
    manualOpen.value = false
    userClosed.value = true
  } else {
    manualOpen.value = true
    userClosed.value = false
  }
}

function targetLabel(target: TimestampTarget) {
  return target === 'attachment' ? t('timestamp.attachmentAudio') : t('timestamp.trackAudio')
}

const examples = computed(() => ([
  { code: '03:15', description: t('timestamp.examples.point') },
  { code: '03:15-04:12', description: t('timestamp.examples.range') },
  { code: '#1', description: t('timestamp.examples.marker') },
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
      <div v-if="markerMatches.length" class="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
        <span
          v-for="(match, index) in markerMatches"
          :key="`marker-${match.index}-${index}`"
          class="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-mono text-info"
        >
          {{ match.raw }}
          <span class="text-info/50">·</span>
          <span class="text-muted-foreground">{{ t('timestamp.markerReference') }}</span>
        </span>
      </div>
    </div>
  </Transition>
</template>
