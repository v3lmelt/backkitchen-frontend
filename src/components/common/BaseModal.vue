<script lang="ts">
const activeModals: symbol[] = []
let modalLayer = 50
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open?: boolean
  maxWidth?: string
  closable?: boolean
  ariaLabel?: string
}>(), {
  open: false,
  maxWidth: 'max-w-md',
  closable: true,
  ariaLabel: undefined,
})
const emit = defineEmits<{
  close: []
  'after-leave': []
}>()
const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)
const layer = ref(50)
const identity = Symbol('modal')
let opener: HTMLElement | null = null
let session = 0
let listening = false
let leaving = false

function focusableElements(): HTMLElement[] {
  return Array.from(dialogRef.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? []).filter(element => !element.closest('[inert], [hidden], [aria-hidden="true"]') && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none')
}

function onKeydown(event: KeyboardEvent) {
  if (activeModals.at(-1) !== identity) return
  event.stopPropagation()
  if (event.defaultPrevented || event.isComposing) return
  if (!props.open) {
    event.preventDefault()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusableElements()
  const first = elements[0]
  const last = elements.at(-1)
  const active = document.activeElement
  if (!first) {
    event.preventDefault()
    dialogRef.value?.focus()
  } else if (!dialogRef.value?.contains(active) || active === dialogRef.value) {
    event.preventDefault()
    ;(event.shiftKey ? last : first)?.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function release() {
  const wasTop = activeModals.at(-1) === identity
  const index = activeModals.indexOf(identity)
  if (index >= 0) activeModals.splice(index, 1)
  document.removeEventListener('keydown', onKeydown)
  listening = false
  if (wasTop && opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert], [hidden]')) {
    opener.focus()
  }
  opener = null
}

watch(() => props.open, async (open) => {
  const currentSession = ++session
  if (!open) {
    await nextTick()
    if (currentSession === session && !dialogRef.value && !leaving) release()
    return
  }
  if (!listening) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeydown)
    listening = true
  }
  const index = activeModals.indexOf(identity)
  if (index >= 0) activeModals.splice(index, 1)
  activeModals.push(identity)
  layer.value = ++modalLayer
  await nextTick()
  if (currentSession !== session || !props.open || activeModals.at(-1) !== identity) return
  if (dialogRef.value) dialogRef.value.inert = false
  ;(focusableElements()[0] ?? dialogRef.value)?.focus()
}, { immediate: true })

function beforeLeave(element: Element) {
  leaving = true
  const dialog = element.querySelector<HTMLElement>('[role="dialog"]')
  if (dialog) dialog.inert = true
}

function afterLeave() {
  if (props.open) return
  leaving = false
  release()
  emit('after-leave')
}

onBeforeUnmount(() => {
  ++session
  release()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear @before-leave="beforeLeave" @leave-cancelled="leaving = false" @after-leave="afterLeave">
      <div
        v-if="open"
        class="fixed inset-0 bg-overlay/60 flex items-center justify-center"
        :style="{ zIndex: layer }"
        @click.self="open && emit('close')"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="modal-panel bg-card border border-border rounded-none p-6 w-full relative"
          :class="maxWidth"
          :inert="!open"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel"
          tabindex="-1"
        >
          <button
            v-if="closable"
            type="button"
            class="ui-control absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            @click="emit('close')"
            :aria-label="t('common.cancel')"
          >
            <X class="w-4 h-4" />
          </button>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active { transition: opacity var(--motion-modal-in) var(--motion-ease-out); }
.modal-leave-active { transition: opacity var(--motion-modal-out) var(--motion-ease-in); }
.modal-enter-active .modal-panel { transition: transform var(--motion-modal-in) var(--motion-ease-out); }
.modal-leave-active .modal-panel { transition: transform var(--motion-modal-out) var(--motion-ease-in); pointer-events: none; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel { transform: scale(.98); }
</style>
