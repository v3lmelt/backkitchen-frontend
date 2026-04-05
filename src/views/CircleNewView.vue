<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- heading -->
    <div class="flex items-center gap-3">
      <RouterLink to="/circles" class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </RouterLink>
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('circleNew.heading') }}</h1>
    </div>

    <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

    <template v-else>
      <!-- logo -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('circleNew.logoSection') }}</h2>
        <div class="flex items-center gap-5">
          <button
            type="button"
            class="w-20 h-20 rounded-full overflow-hidden border border-border bg-border flex items-center justify-center hover:border-primary transition-colors cursor-pointer shrink-0 relative group"
            @click="logoInputRef?.click()"
          >
            <img v-if="logoPreviewUrl" :src="logoPreviewUrl" alt="" class="w-full h-full object-cover" />
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            <div class="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
          </button>
          <p class="text-xs text-muted-foreground">{{ t('circleNew.logoHint') }}</p>
        </div>
        <input ref="logoInputRef" type="file" accept="image/*" class="hidden" @change="onLogoChange" />
      </div>

      <!-- basic info -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('circleNew.basicInfo') }}</h2>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('circleNew.name') }} *</label>
          <input
            v-model="form.name"
            class="input-field w-full"
            :placeholder="t('circleNew.namePlaceholder')"
            @keyup.enter="submit"
          />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('circleNew.description') }}</label>
          <textarea
            v-model="form.description"
            rows="3"
            class="textarea-field w-full"
            :placeholder="t('circleNew.descriptionPlaceholder')"
          />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('circleNew.website') }}</label>
          <input
            v-model="form.website"
            class="input-field w-full"
            :placeholder="t('circleNew.websitePlaceholder')"
          />
        </div>
      </div>

      <p v-if="error" class="text-error text-sm">{{ error }}</p>

      <button @click="submit" :disabled="submitting" class="btn-primary text-sm w-full">
        {{ submitting ? t('common.loading') : t('circleNew.create') }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { circleApi } from '@/api'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(false)
const logoInputRef = ref<HTMLInputElement | null>(null)
const logoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const submitting = ref(false)
const error = ref('')

const form = reactive({
  name: '',
  description: '',
  website: '',
})

onMounted(() => {
  if (appStore.currentUser?.role !== 'producer') {
    router.replace('/circles')
  }
})

onUnmounted(() => {
  if (logoPreviewUrl.value) URL.revokeObjectURL(logoPreviewUrl.value)
})

function onLogoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  logoFile.value = file
  if (logoPreviewUrl.value) URL.revokeObjectURL(logoPreviewUrl.value)
  logoPreviewUrl.value = URL.createObjectURL(file)
}

async function submit() {
  if (!form.name.trim()) return
  submitting.value = true
  error.value = ''
  try {
    const circle = await circleApi.create({
      name: form.name.trim(),
      description: form.description.trim() || null,
      website: form.website.trim() || null,
    })
    if (logoFile.value) {
      await circleApi.uploadLogo(circle.id, logoFile.value)
    }
    router.push(`/circles/${circle.id}`)
  } catch (e: any) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>
