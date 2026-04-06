<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  /** Max width class, e.g. 'max-w-md', 'max-w-sm' */
  maxWidth?: string
  /** Show close (X) button in top-right corner */
  closable?: boolean
}>(), {
  maxWidth: 'max-w-md',
  closable: true,
})

const emit = defineEmits<{
  close: []
}>()

function onBackdropClick() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      @click.self="onBackdropClick"
    >
      <div
        class="bg-card border border-border rounded-none p-6 w-full relative"
        :class="maxWidth"
      >
        <button
          v-if="closable"
          class="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
