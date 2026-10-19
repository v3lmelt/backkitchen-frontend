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
  <TransitionGroup
    tag="div"
    name="toast"
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
  >
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
  </TransitionGroup>
</template>

<style scoped>
.toast-enter-active {
  transition: transform var(--motion-modal-in) var(--motion-ease-out), opacity var(--motion-modal-in) var(--motion-ease-out);
}
.toast-leave-active {
  transition: transform var(--motion-modal-out) var(--motion-ease-in), opacity var(--motion-modal-out) var(--motion-ease-in);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(var(--motion-offset));
}
.toast-leave-active {
  position: absolute;
  right: 0;
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(var(--motion-offset));
}
.toast-move {
  transition: transform var(--motion-layout) var(--motion-ease-out);
}
</style>
