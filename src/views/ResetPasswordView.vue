<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { Music, AlertCircle, Eye, EyeOff } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t, locale } = useI18n()

const LOCALE_KEY = 'backkitchen_locale'

function toggleLocale() {
  const next = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  locale.value = next
  localStorage.setItem(LOCALE_KEY, next)
}

const token = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

const passwordValid = computed(() => password.value.length >= 8)
const passwordsMatch = computed(() => password.value === confirmPassword.value)
const passwordToggleLabel = computed(() =>
  showPassword.value
    ? (locale.value === 'zh-CN' ? '隐藏密码' : 'Hide password')
    : (locale.value === 'zh-CN' ? '显示密码' : 'Show password')
)

onMounted(() => {
  const t = route.query.token
  if (typeof t === 'string' && t) {
    token.value = t
  } else {
    error.value = t ? '' : 'Missing token'
  }
})

async function handleSubmit() {
  error.value = ''
  if (!token.value) {
    error.value = t('auth.resetPassword.errorMissingToken')
    return
  }
  if (!passwordValid.value) {
    error.value = t('auth.resetPassword.errorTooShort')
    return
  }
  if (!passwordsMatch.value) {
    error.value = t('auth.resetPassword.errorMismatch')
    return
  }
  loading.value = true
  try {
    const auth = await authApi.resetPassword(token.value, password.value)
    appStore.setAuth(auth.user, auth.access_token)
    router.push('/')
  } catch (e: any) {
    error.value = e.message || t('common.requestFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex h-screen w-screen items-center justify-center bg-background overflow-hidden">
    <div class="pointer-events-none absolute inset-0" style="background: radial-gradient(ellipse 600px 400px at 50% 40%, rgba(255,132,0,0.06), transparent)"></div>

    <button
      class="fixed top-4 right-4 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-full transition-colors z-50"
      @click="toggleLocale"
    >{{ t('auth.langToggle') }}</button>

    <div class="relative z-10 w-full max-w-[400px] px-6 animate-fade-in">
      <div class="flex items-center justify-center gap-3 mb-10">
        <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Music class="w-5 h-5 text-background" :stroke-width="2" />
        </div>
        <span class="font-mono text-2xl font-bold text-foreground leading-none">BackKitchen</span>
      </div>

      <div class="bg-card border border-border rounded-none p-8">
        <h1 class="font-mono text-xl font-bold text-foreground mb-1">{{ t('auth.resetPassword.title') }}</h1>
        <p class="text-muted-foreground text-sm font-sans mb-7">{{ t('auth.resetPassword.subtitle') }}</p>

        <Transition name="slide-fade">
          <div v-if="error" class="mb-5 px-4 py-3 bg-error-bg border border-error/20 text-error text-sm font-sans rounded-none flex items-start gap-2">
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" :stroke-width="2" />
            <span>{{ error }}</span>
          </div>
        </Transition>

        <form @submit.prevent="handleSubmit" class="space-y-5">
          <div>
            <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.resetPassword.newPassword') }}</label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="input-field w-full !pr-10"
                :placeholder="t('auth.resetPassword.newPasswordPlaceholder')"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                :aria-label="passwordToggleLabel"
                @click="showPassword = !showPassword"
              >
                <Eye v-if="!showPassword" class="w-4 h-4" :stroke-width="2" />
                <EyeOff v-else class="w-4 h-4" :stroke-width="2" />
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.resetPassword.confirmPassword') }}</label>
            <input
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              class="input-field w-full"
              :placeholder="t('auth.resetPassword.confirmPasswordPlaceholder')"
              autocomplete="new-password"
            />
          </div>

          <button
            type="submit"
            class="btn-primary w-full flex items-center justify-center gap-2 font-mono"
            :disabled="loading"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></span>
            {{ loading ? t('common.loading') : t('auth.resetPassword.submit') }}
          </button>
        </form>

        <div class="flex items-center gap-3 my-6">
          <div class="flex-1 h-px bg-border"></div>
        </div>

        <p class="text-center text-sm text-muted-foreground font-sans">
          <RouterLink to="/login" class="text-primary hover:text-primary-hover transition-colors">{{ t('auth.forgotPassword.backToLogin') }}</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.35s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.slide-fade-enter-active { transition: all 0.25s ease-out; }
.slide-fade-leave-active { transition: all 0.15s ease-in; }
.slide-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
