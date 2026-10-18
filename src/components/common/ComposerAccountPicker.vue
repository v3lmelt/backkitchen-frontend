<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { albumApi } from '@/api'
import type { ComposerAccount } from '@/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  albumId: number
  circleBound: boolean
  excludedUserIds: number[]
}>()
const emit = defineEmits<{
  select: [account: ComposerAccount]
  close: []
}>()
const { t } = useI18n()
const query = ref('')
const loading = ref(false)
const error = ref(false)
const searched = ref(false)
const results = ref<ComposerAccount[]>([])
const visibleResults = computed(() => {
  const excluded = new Set(props.excludedUserIds)
  return results.value.filter(account => !excluded.has(account.id))
})
let requestSequence = 0
let unmounted = false

watch(query, () => {
  requestSequence++
  results.value = []
  error.value = false
  loading.value = false
  searched.value = false
}, { flush: 'sync' })

async function search() {
  const sequence = ++requestSequence
  const term = query.value.trim()
  results.value = []
  error.value = false
  searched.value = Boolean(term || props.circleBound)
  if (!searched.value) return
  loading.value = true
  try {
    const accounts = await albumApi.listComposerCandidates(props.albumId, term)
    if (!unmounted && sequence === requestSequence) results.value = accounts
  } catch {
    if (!unmounted && sequence === requestSequence) error.value = true
  } finally {
    if (!unmounted && sequence === requestSequence) loading.value = false
  }
}

onMounted(() => {
  if (props.circleBound) void search()
})
onBeforeUnmount(() => {
  unmounted = true
  requestSequence++
})
</script>

<template>
  <BaseModal :aria-label="t('upload.accountPickerTitle')" max-width="max-w-lg" @close="emit('close')">
    <div class="space-y-4">
      <h2 class="text-sm font-mono font-semibold text-foreground pr-6">{{ t('upload.accountPickerTitle') }}</h2>
      <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="search">
        <input
          v-model="query"
          type="search"
          class="input-field w-full min-w-0"
          :placeholder="t('upload.accountSearchPlaceholder')"
          :aria-label="t('upload.accountSearchPlaceholder')"
        />
        <button type="submit" class="btn-secondary shrink-0" :disabled="loading">{{ t('upload.accountSearch') }}</button>
      </form>
      <div class="max-h-[50vh] overflow-y-auto space-y-2" :aria-busy="loading" aria-live="polite">
        <p v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
        <p v-else-if="error" role="alert" class="text-sm text-error">{{ t('common.loadFailed') }}</p>
        <p v-else-if="!searched" class="text-sm text-muted-foreground">{{ t('upload.accountSearchPrompt') }}</p>
        <p v-else-if="visibleResults.length === 0" class="text-sm text-muted-foreground">{{ t('upload.accountSearchEmpty') }}</p>
        <button
          v-for="account in visibleResults"
          :key="account.id"
          type="button"
          class="w-full text-left border border-border p-3 text-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :disabled="loading"
          @click="emit('select', account)"
        >
          <span class="block text-sm break-words">{{ account.display_name }}</span>
          <span class="block text-xs text-muted-foreground font-mono break-all">@{{ account.username }} · UID {{ account.id }}</span>
        </button>
      </div>
      <p v-if="!loading && results.length === 50" class="text-xs text-muted-foreground">{{ t('upload.accountSearchLimit') }}</p>
    </div>
  </BaseModal>
</template>
