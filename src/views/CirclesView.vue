<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold font-mono text-foreground">{{ t('circles.heading') }}</h1>
        <p class="text-sm text-muted-foreground mt-1">{{ t('circles.subheading') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <button class="btn-secondary flex items-center gap-2" @click="showJoinModal = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          {{ t('circles.joinCircle') }}
        </button>
        <RouterLink v-if="isProducer" to="/circles/new" class="btn-primary flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ t('circles.newCircle') }}
        </RouterLink>
      </div>
    </div>

    <!-- loading -->
    <div v-if="loading" class="flex items-center justify-center py-24">
      <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- empty -->
    <div v-else-if="circles.length === 0" class="flex flex-col items-center justify-center py-24 gap-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      <p class="text-muted-foreground font-mono text-sm">{{ t('circles.noCircles') }}</p>
      <p class="text-muted-foreground text-xs">{{ t('circles.noCirclesHint') }}</p>
    </div>

    <!-- grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <RouterLink
        v-for="circle in circles"
        :key="circle.id"
        :to="`/circles/${circle.id}`"
        class="bg-card border border-border rounded-none shadow-[0_1px_1.75px_rgba(0,0,0,0.05)] p-6 flex gap-4 items-start hover:border-primary/50 transition-colors"
      >
        <!-- logo -->
        <div class="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-border flex items-center justify-center">
          <img v-if="circle.logo_url" :src="`${API_ORIGIN}${circle.logo_url}`" alt="" class="w-full h-full object-cover" />
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-mono font-semibold text-foreground truncate">{{ circle.name }}</p>
          <p v-if="circle.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">{{ circle.description }}</p>
          <p class="text-xs text-muted-foreground mt-2 font-mono">
            {{ circle.member_count }} {{ t('circles.members') }}
          </p>
        </div>
      </RouterLink>
    </div>

    <!-- join modal -->
    <div v-if="showJoinModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showJoinModal = false">
      <div class="bg-card border border-border rounded-none w-full max-w-sm p-6 flex flex-col gap-5">
        <h2 class="font-mono font-semibold text-foreground">{{ t('circles.joinCircle') }}</h2>
        <div>
          <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circles.inviteCode') }}</label>
          <input
            v-model="joinCode"
            type="text"
            :placeholder="t('circles.inviteCodePlaceholder')"
            class="w-full bg-transparent border border-border rounded-full px-4 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            @keydown.enter="joinCircle"
          />
          <p v-if="joinError" class="text-error text-xs mt-2">{{ joinError }}</p>
        </div>
        <div class="flex justify-end gap-3">
          <button class="btn-secondary" @click="showJoinModal = false">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="joining" @click="joinCircle">
            {{ joining ? t('common.loading') : t('circles.join') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { circleApi, API_ORIGIN } from '@/api'
import type { CircleSummary } from '@/types'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const appStore = useAppStore()
const toast = useToast()

const circles = ref<CircleSummary[]>([])
const loading = ref(true)
const showJoinModal = ref(false)
const joinCode = ref('')
const joinError = ref('')
const joining = ref(false)

const isProducer = computed(() => appStore.currentUser?.role === 'producer')

onMounted(async () => {
  try {
    circles.value = await circleApi.list()
  } finally {
    loading.value = false
  }
})

async function joinCircle() {
  if (!joinCode.value.trim()) return
  joining.value = true
  joinError.value = ''
  try {
    const summary = await circleApi.join(joinCode.value.trim())
    circles.value.push(summary)
    showJoinModal.value = false
    joinCode.value = ''
    toast.success(t('circles.joinSuccess'))
  } catch (e: any) {
    joinError.value = e.message
  } finally {
    joining.value = false
  }
}
</script>
