<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

export interface SelectOption {
  value: any
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: any
    options: SelectOption[]
    placeholder?: string
    size?: 'default' | 'sm'
  }>(),
  { size: 'default' }
)

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const open = ref(false)
const selectRef = ref<HTMLElement>()
const triggerRef = ref<HTMLButtonElement>()
const optionRefs = ref<HTMLButtonElement[]>([])
const highlightedIndex = ref(-1)
const listboxId = `custom-select-${Math.random().toString(36).slice(2, 10)}`

const allOptions = computed<SelectOption[]>(() => (
  props.placeholder !== undefined
    ? [{ value: null, label: props.placeholder }, ...props.options]
    : props.options
))

const selectedIndex = computed(() =>
  allOptions.value.findIndex((option) => option.value === props.modelValue)
)

const selectedLabel = computed(() => {
  const found = allOptions.value.find((o) => o.value === props.modelValue)
  return found ? found.label : props.placeholder ?? ''
})

const isPlaceholder = computed(() => {
  return !props.options.some((o) => o.value === props.modelValue)
})

function setOptionRef(el: unknown, index: number) {
  if (el instanceof HTMLButtonElement) {
    optionRefs.value[index] = el
  }
}

function closeMenu(restoreFocus = true) {
  open.value = false
  highlightedIndex.value = -1
  if (restoreFocus) {
    triggerRef.value?.focus()
  }
}

function syncHighlightedIndex() {
  highlightedIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
}

function focusOption(index: number) {
  highlightedIndex.value = index
  void nextTick(() => {
    optionRefs.value[index]?.focus()
  })
}

function openMenu() {
  if (open.value) return
  syncHighlightedIndex()
  open.value = true
}

function toggle() {
  if (open.value) {
    closeMenu(false)
    return
  }
  openMenu()
}

function select(opt: SelectOption) {
  emit('update:modelValue', opt.value)
  closeMenu()
}

function selectByIndex(index: number) {
  const opt = allOptions.value[index]
  if (opt) {
    select(opt)
  }
}

function onClickOutside(e: MouseEvent) {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    closeMenu(false)
  }
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!open.value) {
      openMenu()
      return
    }
    const next = highlightedIndex.value < allOptions.value.length - 1 ? highlightedIndex.value + 1 : 0
    focusOption(next)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) {
      openMenu()
      return
    }
    const next = highlightedIndex.value > 0 ? highlightedIndex.value - 1 : allOptions.value.length - 1
    focusOption(next)
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!open.value) {
      openMenu()
      return
    }
    selectByIndex(highlightedIndex.value)
    return
  }
  if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    closeMenu()
  }
}

function onOptionKeydown(index: number, e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusOption(index < allOptions.value.length - 1 ? index + 1 : 0)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusOption(index > 0 ? index - 1 : allOptions.value.length - 1)
    return
  }
  if (e.key === 'Home') {
    e.preventDefault()
    focusOption(0)
    return
  }
  if (e.key === 'End') {
    e.preventDefault()
    focusOption(allOptions.value.length - 1)
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    selectByIndex(index)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeMenu()
  }
}

// Position dropdown above if not enough space below
const dropAbove = ref(false)

watch(open, async (val) => {
  if (val) {
    syncHighlightedIndex()
    await nextTick()
    if (triggerRef.value) {
      const rect = triggerRef.value.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      dropAbove.value = spaceBelow < 200 && rect.top > spaceBelow
    }
    await nextTick()
    if (allOptions.value.length > 0 && highlightedIndex.value >= 0) {
      optionRefs.value[highlightedIndex.value]?.focus()
    }
  } else {
    optionRefs.value = []
  }
})

onMounted(() => {
  document.addEventListener('click', onClickOutside, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside, true)
})
</script>

<template>
  <div ref="selectRef" class="custom-select" :class="[size === 'sm' ? 'custom-select--sm' : '']">
    <button
      ref="triggerRef"
      type="button"
      class="custom-select-trigger"
      :class="{ 'text-muted-foreground': isPlaceholder }"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <ChevronDown
        class="custom-select-chevron shrink-0 transition-transform duration-150"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <Transition name="cs-drop">
      <div
        v-if="open"
        :id="listboxId"
        class="custom-select-dropdown"
        :class="{ 'custom-select-dropdown--above': dropAbove }"
        role="listbox"
      >
        <button
          v-for="(opt, index) in allOptions"
          :key="`${index}-${String(opt.value)}`"
          :ref="(el) => setOptionRef(el, index)"
          type="button"
          class="custom-select-option"
          :class="{ 'is-selected': opt.value === modelValue, 'is-active': index === highlightedIndex }"
          role="option"
          :aria-selected="opt.value === modelValue ? 'true' : 'false'"
          @click="select(opt)"
          @keydown="onOptionKeydown(index, $event)"
          @mouseenter="highlightedIndex = index"
        >
          <span class="custom-select-dot" />
          <span class="truncate">{{ opt.label }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
}

/* Trigger — default size */
.custom-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 16px;
  background: var(--color-background, #111111);
  border: 1px solid var(--color-border, #2E2E2E);
  border-radius: 9999px;
  color: var(--color-foreground, #FFFFFF);
  font-family: theme('fontFamily.sans');
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  text-align: left;
}

.custom-select-trigger:hover {
  border-color: rgba(255, 132, 0, 0.4);
}

.custom-select-trigger:focus-visible {
  outline: none;
  border-color: var(--color-primary, #FF8400);
  box-shadow: 0 0 0 1px var(--color-primary, #FF8400);
}

.custom-select-chevron {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.5);
}

/* Small size */
.custom-select--sm .custom-select-trigger {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.custom-select--sm .custom-select-chevron {
  width: 12px;
  height: 12px;
}

/* Dropdown panel */
.custom-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--color-card, #1A1A1A);
  border: 1px solid var(--color-border, #2E2E2E);
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.custom-select-dropdown--above {
  top: auto;
  bottom: calc(100% + 4px);
}

/* Options */
.custom-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: 0;
  font-size: 14px;
  color: var(--color-foreground, #FFFFFF);
  cursor: pointer;
  transition: background-color 0.1s;
  text-align: left;
}

.custom-select--sm .custom-select-option {
  padding: 5px 10px;
  font-size: 12px;
  gap: 6px;
}

.custom-select-option:hover {
  background: var(--color-border, #2E2E2E);
}

.custom-select-option:focus-visible,
.custom-select-option.is-active {
  outline: none;
  background: var(--color-border, #2E2E2E);
}

/* Selected indicator dot */
.custom-select-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
  transition: background-color 0.15s;
}

.custom-select-option.is-selected .custom-select-dot {
  background: var(--color-primary, #FF8400);
}

/* Transition */
.cs-drop-enter-active,
.cs-drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.cs-drop-enter-from,
.cs-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Scrollbar inside dropdown */
.custom-select-dropdown::-webkit-scrollbar {
  width: 4px;
}

.custom-select-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.custom-select-dropdown::-webkit-scrollbar-thumb {
  background: #2E2E2E;
  border-radius: 2px;
}
</style>
