<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  /** Max width class, e.g. 'max-w-md', 'max-w-sm' */
  maxWidth?: string
  /** Show close (X) button in top-right corner */
  closable?: boolean
  /** Accessible label announced by screen readers */
  ariaLabel?: string
}>(), {
  maxWidth: 'max-w-md',
  closable: true,
  ariaLabel: undefined,
})

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
let previousActiveElement: HTMLElement | null = null

function onBackdropClick() {
  emit('close')
}

function getFocusableElements(): HTMLElement[] {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  if (e.key !== 'Tab') return

  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    e.preventDefault()
    dialogRef.value?.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null

  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKeydown)
  void nextTick(() => {
    const focusable = getFocusableElements()
    closeButtonRef.value?.focus()
    if (!closeButtonRef.value) {
      focusable[0]?.focus()
    }
    if (!closeButtonRef.value && focusable.length === 0) {
      dialogRef.value?.focus()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  previousActiveElement?.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop" appear>
      <div
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        @click.self="onBackdropClick"
      >
        <Transition name="modal-panel" appear>
          <div
            ref="dialogRef"
            class="bg-card border border-border rounded-none p-6 w-full relative"
            :class="maxWidth"
            role="dialog"
            aria-modal="true"
            :aria-label="ariaLabel"
            tabindex="-1"
          >
            <button
              v-if="closable"
              ref="closeButtonRef"
              class="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('close')"
              :aria-label="t('common.cancel')"
            >
              <X class="w-4 h-4" />
            </button>
            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop-enter-active {
  transition: opacity 0.18s ease-out;
}
.modal-backdrop-enter-from {
  opacity: 0;
}
.modal-panel-enter-active {
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
}
.modal-panel-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
</style>
