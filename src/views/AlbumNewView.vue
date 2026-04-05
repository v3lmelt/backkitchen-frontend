<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi } from '@/api'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const creating = ref(false)
const form = ref({ title: '', description: '', cover_color: '#A855F7' })
const titleError = ref('')

onMounted(() => {
  if (appStore.currentUser?.role !== 'producer') {
    router.replace('/albums')
  }
})

async function create() {
  titleError.value = ''
  if (!form.value.title.trim()) {
    titleError.value = t('albumNew.titleRequired')
    return
  }
  creating.value = true
  try {
    const album = await albumApi.create(form.value)
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

    <div class="card space-y-5">
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
      <div>
        <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.description') }}</label>
        <textarea
          v-model="form.description"
          class="textarea-field w-full h-20"
          :placeholder="t('albumNew.descriptionPlaceholder')"
        />
      </div>
      <div>
        <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.coverColor') }}</label>
        <input v-model="form.cover_color" type="color" class="input-field w-full h-10 cursor-pointer" />
      </div>
      <button @click="create" :disabled="creating" class="btn-primary text-sm w-full">
        {{ creating ? t('albumNew.creating') : t('albumNew.createButton') }}
      </button>
    </div>
  </div>
</template>
