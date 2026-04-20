<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

const { t } = useI18n()
const open = ref(false)

const waveformRows = computed(() => [
  { key: t('shortcuts.keys.space'), label: t('shortcuts.playPause') },
  { key: '[', label: t('shortcuts.setRangeStart') },
  { key: ']', label: t('shortcuts.setRangeEnd') },
  { key: 'Backspace', label: t('shortcuts.undoMarker') },
  { key: 'Esc', label: t('shortcuts.clearAnchor') },
])

const navRows = computed(() => [
  { key: '← / →', label: t('shortcuts.seek') },
  { key: 'J', label: t('shortcuts.prevIssue') },
  { key: 'K', label: t('shortcuts.nextIssue') },
  { key: '?', label: t('shortcuts.showHelp') },
])

function onKeydown(e: KeyboardEvent) {
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === '?') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'Escape') open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
        @click.self="open = false"
      >
        <div class="modal-panel bg-card border border-border rounded-none w-full max-w-md shadow-xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('shortcuts.title') }}</h2>
            <button @click="open = false" class="text-muted-foreground hover:text-foreground transition-colors">
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
          <div class="p-5 space-y-5">
            <div class="space-y-2">
              <p class="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">{{ t('shortcuts.sectionWaveform') }}</p>
              <div class="space-y-1.5 text-sm">
                <div v-for="row in waveformRows" :key="row.key" class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground">{{ row.label }}</span>
                  <kbd class="font-mono text-xs bg-border text-foreground px-2 py-0.5 rounded flex-shrink-0">{{ row.key }}</kbd>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">{{ t('shortcuts.sectionNavigation') }}</p>
              <div class="space-y-1.5 text-sm">
                <div v-for="row in navRows" :key="row.key" class="flex items-center justify-between gap-4">
                  <span class="text-muted-foreground">{{ row.label }}</span>
                  <kbd class="font-mono text-xs bg-border text-foreground px-2 py-0.5 rounded flex-shrink-0">{{ row.key }}</kbd>
                </div>
              </div>
            </div>
            <p class="text-xs text-muted-foreground border-t border-border pt-3">{{ t('shortcuts.hint') }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease-out; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fade-enter-active .modal-panel {
  animation: modal-panel-in 0.18s ease-out;
}
.fade-leave-active .modal-panel {
  animation: modal-panel-out 0.14s ease-in;
}
@keyframes modal-panel-in {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes modal-panel-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.98); }
}
</style>
