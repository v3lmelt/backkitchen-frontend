<script setup lang="ts">
defineProps<{
  /** Number of skeleton rows to render */
  rows?: number
  /** Show a card-style wrapper */
  card?: boolean
}>()
</script>

<template>
  <div :class="card ? 'card space-y-3' : 'space-y-3'">
    <div
      v-for="i in (rows ?? 3)"
      :key="i"
      class="h-4 bg-border rounded animate-pulse"
      :style="{ width: `${60 + (i % 3) * 15}%` }"
    ></div>
  </div>
</template>
