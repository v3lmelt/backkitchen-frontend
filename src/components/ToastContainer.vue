<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

const { toasts, removeToast } = useToast()

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 shadow-lg min-w-72 max-w-96"
    >
      <component :is="iconMap[toast.type]" :class="colorMap[toast.type]" class="w-5 h-5 shrink-0" />
      <span class="text-sm text-foreground flex-1">{{ toast.message }}</span>
      <button
        @click="removeToast(toast.id)"
        class="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
