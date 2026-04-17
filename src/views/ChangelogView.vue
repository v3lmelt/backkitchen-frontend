<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Megaphone } from 'lucide-vue-next'
import {
  CHANGELOG,
  CHANGELOG_SEEN_EVENT,
  CHANGELOG_SEEN_KEY,
  LATEST_CHANGELOG_VERSION,
  pickLocalized,
  type LocalizedText,
} from '@/data/changelog'

const { t, locale } = useI18n()

function isLatest(version: string) {
  return version === LATEST_CHANGELOG_VERSION
}

function localize(text: LocalizedText) {
  return pickLocalized(text, String(locale.value))
}

onMounted(() => {
  if (LATEST_CHANGELOG_VERSION) {
    localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_VERSION)
    window.dispatchEvent(new CustomEvent(CHANGELOG_SEEN_EVENT))
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-full bg-warning-bg flex items-center justify-center flex-shrink-0">
        <Megaphone class="w-5 h-5 text-warning" :stroke-width="2" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('changelog.heading') }}</h1>
        <p class="text-sm text-muted-foreground mt-1">{{ t('changelog.subheading') }}</p>
      </div>
    </div>

    <article
      v-for="entry in CHANGELOG"
      :key="entry.version"
      class="bg-card border border-border rounded-none p-6 space-y-5 shadow-[0_1px_1.75px_rgba(0,0,0,0.05)]"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-sm font-mono font-semibold text-foreground tracking-wide">
            v{{ entry.version }}
          </h2>
          <span
            v-if="isLatest(entry.version)"
            class="px-2 py-0.5 rounded-full bg-warning-bg text-warning text-[11px] font-mono"
          >
            {{ t('changelog.latest') }}
          </span>
          <span class="text-xs text-muted-foreground">{{ entry.date }}</span>
        </div>
        <h3 class="text-lg font-mono font-semibold text-foreground mt-2">
          {{ localize(entry.headline) }}
        </h3>
      </div>

      <p class="text-sm text-muted-foreground leading-relaxed">
        {{ localize(entry.summary) }}
      </p>

      <div class="h-px bg-border"></div>

      <section
        v-for="(section, sectionIdx) in entry.sections"
        :key="sectionIdx"
        class="space-y-3"
      >
        <h4 class="text-sm font-mono font-semibold text-foreground">
          {{ localize(section.heading) }}
        </h4>
        <ul class="space-y-3">
          <li
            v-for="(item, idx) in section.items"
            :key="idx"
            class="flex gap-3"
          >
            <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"></span>
            <div class="flex-1 min-w-0 space-y-1">
              <p class="text-sm font-medium text-foreground">
                {{ localize(item.title) }}
              </p>
              <p
                v-if="item.description"
                class="text-sm text-muted-foreground leading-relaxed"
              >
                {{ localize(item.description) }}
              </p>
            </div>
          </li>
        </ul>
      </section>
    </article>
  </div>
</template>
