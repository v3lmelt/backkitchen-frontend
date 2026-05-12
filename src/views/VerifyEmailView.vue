<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
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
  <div class="flex h-screen w-screen bg-background items-center justify-center px-6">
    <div class="fixed right-4 top-4 z-50">
      <ThemeToggle />
    </div>
    <div class="w-full max-w-md bg-card border border-border rounded-2xl p-10 text-center">

      <!-- Loading -->
      <template v-if="status === 'loading'">
        <div class="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center mx-auto mb-6">
          <span class="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin"></span>
        </div>
        <h1 class="font-mono text-xl font-bold text-foreground mb-2">{{ t('auth.verifyEmail.loadingTitle') }}</h1>
        <p class="text-muted-foreground text-sm font-sans">{{ t('auth.verifyEmail.loadingSubtitle') }}</p>
      </template>

      <!-- Success -->
      <template v-else-if="status === 'success'">
        <div class="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 class="w-7 h-7 text-success" :stroke-width="2" />
        </div>
        <h1 class="font-mono text-xl font-bold text-foreground mb-2">{{ t('auth.verifyEmail.successTitle') }}</h1>
        <p class="text-muted-foreground text-sm font-sans">{{ t('auth.verifyEmail.successSubtitle') }}</p>
      </template>

      <!-- Error -->
      <template v-else>
        <div class="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center mx-auto mb-6">
          <XCircle class="w-7 h-7 text-error" :stroke-width="2" />
        </div>
        <h1 class="font-mono text-xl font-bold text-foreground mb-2">{{ t('auth.verifyEmail.errorTitle') }}</h1>
        <p class="text-muted-foreground text-sm font-sans mb-8">{{ errorMessage }}</p>
        <RouterLink to="/login" class="btn-secondary inline-flex items-center justify-center px-6">
          {{ t('auth.verifyEmail.backToLogin') }}
        </RouterLink>
      </template>

    </div>
  </div>
</template>
