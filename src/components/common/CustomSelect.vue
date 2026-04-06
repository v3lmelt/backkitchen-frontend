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
const triggerRef = ref<HTMLElement>()

const selectedLabel = computed(() => {
  const found = props.options.find((o) => o.value === props.modelValue)
  return found ? found.label : props.placeholder ?? ''
})

const isPlaceholder = computed(() => {
  return !props.options.some((o) => o.value === props.modelValue)
})

function toggle() {
  open.value = !open.value
}

function select(opt: SelectOption) {
  emit('update:modelValue', opt.value)
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    open.value = false
    triggerRef.value?.focus()
  }
}

// Position dropdown above if not enough space below
const dropAbove = ref(false)

watch(open, async (val) => {
  if (val) {
    await nextTick()
    if (triggerRef.value) {
      const rect = triggerRef.value.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      dropAbove.value = spaceBelow < 200 && rect.top > spaceBelow
    }
  }
})

onMounted(() => {
  document.addEventListener('click', onClickOutside, true)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="selectRef" class="custom-select" :class="[size === 'sm' ? 'custom-select--sm' : '']">
    <button
      ref="triggerRef"
      type="button"
      class="custom-select-trigger"
      :class="{ 'text-muted-foreground': isPlaceholder }"
      @click="toggle"
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
        class="custom-select-dropdown"
        :class="{ 'custom-select-dropdown--above': dropAbove }"
      >
        <div
          v-if="placeholder !== undefined"
          class="custom-select-option"
          :class="{ 'is-selected': isPlaceholder }"
          @click="select({ value: null, label: placeholder! })"
        >
          <span class="custom-select-dot" />
          <span class="truncate">{{ placeholder }}</span>
        </div>
        <div
          v-for="opt in options"
          :key="String(opt.value)"
          class="custom-select-option"
          :class="{ 'is-selected': opt.value === modelValue }"
          @click="select(opt)"
        >
          <span class="custom-select-dot" />
          <span class="truncate">{{ opt.label }}</span>
        </div>
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
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-foreground, #FFFFFF);
  cursor: pointer;
  transition: background-color 0.1s;
}

.custom-select--sm .custom-select-option {
  padding: 5px 10px;
  font-size: 12px;
  gap: 6px;
}

.custom-select-option:hover {
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
