<script setup lang="ts">
import { computed } from 'vue'

import type { MarkerIndexReference, TimeReference, TimestampTarget } from '@/utils/timestamps'
import { resolveTimeReferenceTarget, splitTextWithInlineReferences } from '@/utils/timestamps'

const props = withDefaults(defineProps<{
  text: string
  defaultTarget?: TimestampTarget
  interactive?: boolean
}>(), {
  defaultTarget: 'track',
  interactive: true,
})

const emit = defineEmits<{
  activate: [reference: TimeReference, target: TimestampTarget]
  markerActivate: [reference: MarkerIndexReference]
}>()

const segments = computed(() => splitTextWithInlineReferences(props.text))

function activate(reference: TimeReference) {
  if (!props.interactive) return
  emit('activate', reference, resolveTimeReferenceTarget(reference, props.defaultTarget))
}

function activateMarker(reference: MarkerIndexReference) {
  if (!props.interactive) return
  emit('markerActivate', reference)
}
</script>

<template>
  <span class="whitespace-pre-wrap break-words text-inherit">
    <template v-for="(segment, index) in segments" :key="`${segment.type}-${index}`">
      <span v-if="segment.type === 'text'">{{ segment.value }}</span>
      <button
        v-else-if="segment.type === 'time' && interactive"
        type="button"
        class="mx-0.5 inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-warning transition-colors hover:bg-primary hover:text-background focus:outline-none focus:ring-1 focus:ring-primary"
        @click="activate(segment.value)"
      >
        {{ segment.value.raw }}
      </button>
      <span
        v-else-if="segment.type === 'time'"
        class="mx-0.5 inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-warning"
      >
        {{ segment.value.raw }}
      </span>
      <button
        v-else-if="interactive"
        type="button"
        class="mx-0.5 inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-info transition-colors hover:bg-primary hover:text-background focus:outline-none focus:ring-1 focus:ring-primary"
        @click="activateMarker(segment.value)"
      >
        {{ segment.value.raw }}
      </button>
      <span
        v-else
        class="mx-0.5 inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-info"
      >
        {{ segment.value.raw }}
      </span>
    </template>
  </span>
</template>
