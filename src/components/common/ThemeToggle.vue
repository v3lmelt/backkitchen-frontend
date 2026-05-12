<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Moon, Sun } from 'lucide-vue-next'
import { THEME_CHANGED_EVENT, initializeTheme, toggleTheme, type ThemeMode } from '@/utils/theme'

const { t } = useI18n()
const theme = ref<ThemeMode>(initializeTheme())

const nextTheme = computed<ThemeMode>(() => (theme.value === 'dark' ? 'light' : 'dark'))
const label = computed(() =>
  nextTheme.value === 'light'
    ? t('theme.switchToLight')
    : t('theme.switchToDark')
)

function handleToggle() {
  theme.value = toggleTheme(theme.value)
}

function handleThemeChanged(event: Event) {
  const detail = (event as CustomEvent<ThemeMode>).detail
  if (detail === 'dark' || detail === 'light') {
    theme.value = detail
  }
}

onMounted(() => window.addEventListener(THEME_CHANGED_EVENT, handleThemeChanged))
onBeforeUnmount(() => window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChanged))
</script>

<template>
  <button
    type="button"
    data-testid="theme-toggle"
    class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    :aria-label="label"
    :title="label"
    @click="handleToggle"
  >
    <Sun v-if="theme === 'dark'" class="h-4 w-4" :stroke-width="2" />
    <Moon v-else class="h-4 w-4" :stroke-width="2" />
  </button>
</template>
