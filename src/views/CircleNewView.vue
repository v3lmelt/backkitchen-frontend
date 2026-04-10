<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- heading -->
    <div class="flex items-center gap-3">
      <RouterLink to="/circles" class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
        <ChevronLeft class="w-5 h-5" :stroke-width="2" />
      </RouterLink>
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('circleNew.heading') }}</h1>
    </div>

    <div v-if="loading"><SkeletonLoader :rows="3" :card="true" /></div>

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
            <Smile v-else class="w-6 h-6 text-muted-foreground" :stroke-width="1.5" />
            <div class="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload class="w-4 h-4 text-white" :stroke-width="2" />
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
            :class="{ 'border-error': nameError }"
            :placeholder="t('circleNew.namePlaceholder')"
            @blur="validateName"
            @keyup.enter="submit"
          />
          <p v-if="nameError" class="text-xs text-error mt-1">{{ nameError }}</p>
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

      <div v-if="error" class="bg-error-bg border border-error/30 rounded-none px-4 py-3 text-sm text-error">{{ error }}</div>

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
import { ChevronLeft, Smile, Upload } from 'lucide-vue-next'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(false)
const logoInputRef = ref<HTMLInputElement | null>(null)
const logoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const submitting = ref(false)
const error = ref('')
const nameError = ref('')

function validateName() {
  nameError.value = form.name.trim() ? '' : t('circleNew.nameRequired')
}

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
  validateName()
  if (nameError.value) return
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
