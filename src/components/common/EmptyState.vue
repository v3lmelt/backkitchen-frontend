<script setup lang="ts">
defineProps<{
  icon?: object | null
  title: string
  hint?: string
  ctaLabel?: string
}>()

defineEmits<{ cta: [] }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center gap-3">
    <component v-if="icon" :is="icon" class="w-10 h-10 text-border" :stroke-width="1.5" />
    <p class="text-sm font-mono font-semibold text-foreground">{{ title }}</p>
    <p v-if="hint" class="text-xs text-muted-foreground max-w-xs">{{ hint }}</p>
    <button v-if="ctaLabel" @click="$emit('cta')" class="btn-primary text-sm mt-1">{{ ctaLabel }}</button>
  </div>
</template>
