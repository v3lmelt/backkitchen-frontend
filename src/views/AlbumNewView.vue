<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, userApi } from '@/api'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { useAppStore } from '@/stores/app'
import type { User } from '@/types'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(true)
const creating = ref(false)
const users = ref<User[]>([])

const form = ref({ title: '', description: '' })
const titleError = ref('')

const coverInputRef = ref<HTMLInputElement | null>(null)
const coverImageFile = ref<File | null>(null)
const coverPreviewUrl = ref<string | null>(null)

const teamState = reactive<{ mastering_engineer_id: number | null; member_ids: number[] }>({
  mastering_engineer_id: null,
  member_ids: [],
})

const deadlineState = reactive({ deadline: '', peer_review: '', mastering: '', final_review: '' })

onMounted(async () => {
  if (appStore.currentUser?.role !== 'producer') {
    router.replace('/albums')
    return
  }
  loading.value = true
  try {
    users.value = await userApi.list()
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
})

function handleCoverSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  coverImageFile.value = file
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
  coverPreviewUrl.value = URL.createObjectURL(file)
}

function toggleMember(userId: number) {
  if (teamState.member_ids.includes(userId)) {
    teamState.member_ids = teamState.member_ids.filter(id => id !== userId)
  } else {
    teamState.member_ids = [...teamState.member_ids, userId]
  }
}

async function create() {
  titleError.value = ''
  if (!form.value.title.trim()) {
    titleError.value = t('albumNew.titleRequired')
    return
  }
  creating.value = true
  try {
    const album = await albumApi.create(form.value)

    const tasks: Promise<any>[] = []

    if (coverImageFile.value) {
      tasks.push(albumApi.uploadCover(album.id, coverImageFile.value))
    }

    const hasTeam = teamState.mastering_engineer_id !== null || teamState.member_ids.length > 0
    if (hasTeam) {
      tasks.push(albumApi.updateTeam(album.id, teamState))
    }

    const hasDeadline = deadlineState.deadline || deadlineState.peer_review ||
      deadlineState.mastering || deadlineState.final_review
    if (hasDeadline) {
      const phaseDeadlines: Record<string, string> = {}
      if (deadlineState.peer_review) phaseDeadlines.peer_review = new Date(deadlineState.peer_review).toISOString()
      if (deadlineState.mastering) phaseDeadlines.mastering = new Date(deadlineState.mastering).toISOString()
      if (deadlineState.final_review) phaseDeadlines.final_review = new Date(deadlineState.final_review).toISOString()
      tasks.push(albumApi.updateDeadlines(album.id, {
        deadline: deadlineState.deadline ? new Date(deadlineState.deadline).toISOString() : null,
        phase_deadlines: Object.keys(phaseDeadlines).length ? phaseDeadlines : null,
      }))
    }

    await Promise.all(tasks)
    router.push(`/albums/${album.id}/settings`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <RouterLink to="/albums" class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </RouterLink>
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('albumNew.heading') }}</h1>
    </div>

    <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

    <template v-else>
      <!-- 基本信息 -->
      <div class="card space-y-5">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.basicInfo') }}</h2>

        <div class="flex items-start gap-5">
          <!-- 封面预览 -->
          <div class="flex-shrink-0 space-y-1.5">
            <div
              class="relative w-24 h-24 overflow-hidden border border-border cursor-pointer group"
              @click="coverInputRef?.click()"
            >
              <img
                :src="coverPreviewUrl || albumPlaceholder"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 12l-4-4-4 4M12 8v8" />
                </svg>
              </div>
            </div>
            <p class="text-xs text-muted-foreground text-center w-24">{{ t('albumNew.coverImageHint') }}</p>
            <input ref="coverInputRef" type="file" accept="image/*" class="hidden" @change="handleCoverSelect" />
          </div>

          <!-- 标题 + 描述 + 颜色 -->
          <div class="flex-1 space-y-3">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.albumTitle') }}</label>
              <input
                v-model="form.title"
                class="input-field w-full"
                :placeholder="t('albumNew.albumTitlePlaceholder')"
                @keyup.enter="create"
              />
              <p v-if="titleError" class="text-xs text-error mt-1">{{ titleError }}</p>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.description') }}</label>
          <textarea
            v-model="form.description"
            class="textarea-field w-full h-20"
            :placeholder="t('albumNew.descriptionPlaceholder')"
          />
        </div>
      </div>

      <!-- 团队 -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.teamSection') }}</h2>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringEngineerSelect') }}</label>
          <select v-model="teamState.mastering_engineer_id" class="select-field w-full">
            <option :value="null">{{ t('settings.noneOption') }}</option>
            <option v-for="user in users" :key="user.id" :value="user.id">{{ user.display_name }}</option>
          </select>
        </div>
        <div>
          <div class="text-xs text-muted-foreground mb-2">{{ t('settings.participants') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              v-for="user in users"
              :key="user.id"
              class="flex items-center gap-2 text-sm text-foreground cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="teamState.member_ids.includes(user.id)"
                @change="toggleMember(user.id)"
              />
              <span>{{ user.display_name }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 截止日期 -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.deadlinesSection') }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumDeadline') }}</label>
            <input v-model="deadlineState.deadline" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.peerReviewDeadline') }}</label>
            <input v-model="deadlineState.peer_review" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringDeadline') }}</label>
            <input v-model="deadlineState.mastering" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.finalReviewDeadline') }}</label>
            <input v-model="deadlineState.final_review" type="date" class="input-field w-full" />
          </div>
        </div>
      </div>

      <button @click="create" :disabled="creating" class="btn-primary text-sm w-full">
        {{ creating ? t('albumNew.creating') : t('albumNew.createButton') }}
      </button>
    </template>
  </div>
</template>
