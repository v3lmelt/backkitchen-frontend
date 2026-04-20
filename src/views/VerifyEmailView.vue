<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { CheckCircle2, XCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t } = useI18n()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMessage = ref('')

onMounted(async () => {
  const token = route.query.token as string | undefined
  if (!token) {
    status.value = 'error'
    errorMessage.value = t('auth.verifyEmail.errorMissingToken')
    return
  }
  try {
    const auth = await authApi.verifyEmail(token)
    appStore.setAuth(auth.user, auth.access_token)
    status.value = 'success'
    setTimeout(() => router.push('/'), 2000)
  } catch (e: any) {
    status.value = 'error'
    errorMessage.value = e.message || t('auth.verifyEmail.errorGeneric')
  }
})
</script>

<template>
  <div class="flex h-screen w-screen bg-[#111111] items-center justify-center px-6">
    <div class="w-full max-w-md bg-[#1A1A1A] border border-[#2E2E2E] rounded-2xl p-10 text-center">

      <!-- Loading -->
      <template v-if="status === 'loading'">
        <div class="w-14 h-14 rounded-full bg-[#1A1A1A] border border-[#2E2E2E] flex items-center justify-center mx-auto mb-6">
          <span class="w-6 h-6 border-2 border-[#2E2E2E] border-t-[#FF8400] rounded-full animate-spin"></span>
        </div>
        <h1 class="font-mono text-xl font-bold text-white mb-2">{{ t('auth.verifyEmail.loadingTitle') }}</h1>
        <p class="text-[#B8B9B6] text-sm font-sans">{{ t('auth.verifyEmail.loadingSubtitle') }}</p>
      </template>

      <!-- Success -->
      <template v-else-if="status === 'success'">
        <div class="w-14 h-14 rounded-full bg-[#222924] flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 class="w-7 h-7 text-[#B6FFCE]" :stroke-width="2" />
        </div>
        <h1 class="font-mono text-xl font-bold text-white mb-2">{{ t('auth.verifyEmail.successTitle') }}</h1>
        <p class="text-[#B8B9B6] text-sm font-sans">{{ t('auth.verifyEmail.successSubtitle') }}</p>
      </template>

      <!-- Error -->
      <template v-else>
        <div class="w-14 h-14 rounded-full bg-[#24100B] flex items-center justify-center mx-auto mb-6">
          <XCircle class="w-7 h-7 text-[#FF5C33]" :stroke-width="2" />
        </div>
        <h1 class="font-mono text-xl font-bold text-white mb-2">{{ t('auth.verifyEmail.errorTitle') }}</h1>
        <p class="text-[#B8B9B6] text-sm font-sans mb-8">{{ errorMessage }}</p>
        <RouterLink to="/login" class="btn-secondary inline-flex items-center justify-center px-6">
          {{ t('auth.verifyEmail.backToLogin') }}
        </RouterLink>
      </template>

    </div>
  </div>
</template>
