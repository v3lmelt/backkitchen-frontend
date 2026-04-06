<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { Music, AlertCircle, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()
const { t, locale } = useI18n()

const LOCALE_KEY = 'backkitchen_locale'

function toggleLocale() {
  const next = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  locale.value = next
  localStorage.setItem(LOCALE_KEY, next)
}

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

const emailTouched = ref(false)
const passwordTouched = ref(false)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))

async function handleSubmit() {
  error.value = ''
  emailTouched.value = true
  passwordTouched.value = true

  if (!email.value || !password.value) {
    error.value = t('auth.login.errorRequired')
    return
  }
  loading.value = true
  try {
    const auth = await authApi.login(email.value, password.value)
    appStore.setAuth(auth.user, auth.access_token)
    router.push('/')
  } catch (e: any) {
    if (e.message?.toLowerCase().includes('not verified')) {
      error.value = t('auth.login.errorNotVerified')
    } else {
      error.value = e.message || t('auth.login.errorInvalid')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="relative flex h-screen w-screen items-center justify-center bg-background overflow-hidden">
    <!-- Subtle radial glow -->
    <div class="pointer-events-none absolute inset-0" style="background: radial-gradient(ellipse 600px 400px at 50% 40%, rgba(255,132,0,0.06), transparent)"></div>

    <!-- Language toggle -->
    <button
      class="fixed top-4 right-4 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-full transition-colors z-50"
      @click="toggleLocale"
    >{{ t('auth.langToggle') }}</button>

    <div class="relative z-10 w-full max-w-[400px] px-6 animate-fade-in">
      <!-- Logo -->
      <div class="flex items-center justify-center gap-3 mb-10">
        <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Music class="w-5 h-5 text-background" :stroke-width="2" />
        </div>
        <span class="font-mono text-2xl font-bold text-foreground leading-none">BackKitchen</span>
      </div>

      <!-- Card -->
      <div class="bg-card border border-border rounded-none p-8">
        <h1 class="font-mono text-xl font-bold text-foreground mb-1">{{ t('auth.login.title') }}</h1>
        <p class="text-muted-foreground text-sm font-sans mb-7">{{ t('auth.login.subtitle') }}</p>

        <!-- Error -->
        <Transition name="slide-fade">
          <div v-if="error" class="mb-5 px-4 py-3 bg-error-bg border border-error/20 text-error text-sm font-sans rounded-none flex items-start gap-2">
            <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" :stroke-width="2" />
            <span>{{ error }}</span>
          </div>
        </Transition>

        <form @submit.prevent="handleSubmit" class="space-y-5">
          <!-- Email -->
          <div>
            <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.login.email') }}</label>
            <input
              v-model="email"
              type="email"
              class="input-field w-full"
              :class="{ '!border-error !ring-error': emailTouched && email && !emailValid }"
              :placeholder="t('auth.login.emailPlaceholder')"
              autocomplete="email"
              @blur="emailTouched = true"
            />
          </div>

          <!-- Password with toggle -->
          <div>
            <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.login.password') }}</label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="input-field w-full !pr-10"
                :placeholder="t('auth.login.passwordPlaceholder')"
                autocomplete="current-password"
                @blur="passwordTouched = true"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                :title="showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')"
                @click="showPassword = !showPassword"
              >
                <Eye v-if="!showPassword" class="w-4 h-4" :stroke-width="2" />
                <EyeOff v-else class="w-4 h-4" :stroke-width="2" />
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="rememberMe" type="checkbox" class="checkbox" />
              <span class="text-sm text-muted-foreground font-sans">{{ t('auth.login.rememberMe') }}</span>
            </label>
            <a href="#" class="text-sm text-primary hover:text-primary-hover font-sans transition-colors">{{ t('auth.login.forgotPassword') }}</a>
          </div>

          <button
            type="submit"
            class="btn-primary w-full flex items-center justify-center gap-2 font-mono"
            :disabled="loading"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></span>
            {{ loading ? t('auth.login.signingIn') : t('auth.login.signIn') }}
          </button>
        </form>

        <!-- Divider -->
        <div class="flex items-center gap-3 my-6">
          <div class="flex-1 h-px bg-border"></div>
          <span class="text-muted-foreground text-xs font-sans">{{ t('auth.login.or') }}</span>
          <div class="flex-1 h-px bg-border"></div>
        </div>

        <p class="text-center text-sm text-muted-foreground font-sans">
          {{ t('auth.login.noAccount') }}
          <RouterLink to="/register" class="text-primary hover:text-primary-hover ml-1 transition-colors">{{ t('auth.login.register') }}</RouterLink>
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
