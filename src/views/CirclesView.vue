<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
      <div>
        <h1 class="text-2xl font-semibold font-mono text-foreground">{{ t('circles.heading') }}</h1>
        <p class="text-sm text-muted-foreground mt-1">{{ t('circles.subheading') }}</p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <button class="btn-secondary flex items-center gap-2" @click="showJoinModal = true">
          <UserPlus class="w-4 h-4" :stroke-width="2" />
          {{ t('circles.joinCircle') }}
        </button>
        <RouterLink v-if="isProducer" to="/circles/new" class="btn-primary flex items-center gap-2">
          <Plus class="w-4 h-4" :stroke-width="2" />
          {{ t('circles.newCircle') }}
        </RouterLink>
      </div>
    </div>

    <!-- loading -->
    <div v-if="loading">
      <SkeletonLoader :rows="4" :card="true" />
    </div>

    <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
      <p class="text-sm text-error">{{ loadError }}</p>
      <button @click="loadCircles" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
    </div>

    <!-- empty -->
    <div v-else-if="circles.length === 0" class="flex flex-col items-center justify-center py-24 gap-4">
      <Smile class="w-10 h-10 text-muted-foreground" :stroke-width="1.5" />
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
          <img v-if="circle.logo_url" :src="`${API_ORIGIN}/uploads/${circle.logo_url}`" alt="" class="w-full h-full object-cover" />
          <Smile v-else class="w-5 h-5 text-muted-foreground" :stroke-width="1.5" />
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
    <BaseModal v-if="showJoinModal" max-width="max-w-sm" @close="showJoinModal = false">
      <div class="flex flex-col gap-5">
        <h2 class="font-mono font-semibold text-foreground">{{ t('circles.joinCircle') }}</h2>
        <div>
          <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circles.inviteCode') }}</label>
          <input
            v-model="joinCode"
            type="text"
            :placeholder="t('circles.inviteCodePlaceholder')"
            class="input-field w-full"
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
    </BaseModal>
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
import { UserPlus, Plus, Smile } from 'lucide-vue-next'
import BaseModal from '@/components/common/BaseModal.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'

const { t } = useI18n()
const appStore = useAppStore()
const toast = useToast()

const circles = ref<CircleSummary[]>([])
const loading = ref(true)
const loadError = ref('')
const showJoinModal = ref(false)
const joinCode = ref('')
const joinError = ref('')
const joining = ref(false)

const isProducer = computed(() => appStore.currentUser?.role === 'producer')

async function loadCircles() {
  loading.value = true
  loadError.value = ''
  try {
    circles.value = await circleApi.list()
  } catch (error: any) {
    circles.value = []
    loadError.value = error?.message || t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(loadCircles)

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
