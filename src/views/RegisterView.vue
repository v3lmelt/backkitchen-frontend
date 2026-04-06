<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { Music, AlertCircle, Eye, EyeOff, Mail, CheckCircle2, Check } from 'lucide-vue-next'

const { t, locale } = useI18n()

const LOCALE_KEY = 'backkitchen_locale'

function toggleLocale() {
  const next = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  locale.value = next
  localStorage.setItem(LOCALE_KEY, next)
}

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const termsAccepted = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const error = ref('')
const loading = ref(false)
const registeredEmail = ref('')
const resendLoading = ref(false)
const resendDone = ref(false)

// Touched state for inline validation
const usernameTouched = ref(false)
const emailTouched = ref(false)
const passwordTouched = ref(false)
const confirmTouched = ref(false)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
const passwordLongEnough = computed(() => password.value.length >= 8)
const passwordsMatch = computed(() => password.value === confirmPassword.value)

async function handleSubmit() {
  error.value = ''
  usernameTouched.value = true
  emailTouched.value = true
  passwordTouched.value = true
  confirmTouched.value = true

  if (!username.value || !email.value || !password.value || !confirmPassword.value) {
    error.value = t('auth.register.errorRequired')
    return
  }
  if (!passwordLongEnough.value) {
    error.value = t('auth.register.passwordMinLength')
    return
  }
  if (!passwordsMatch.value) {
    error.value = t('auth.register.errorPasswordMismatch')
    return
  }
  if (!termsAccepted.value) {
    error.value = t('auth.register.errorTerms')
    return
  }

  loading.value = true
  try {
    const res = await authApi.register({
      username: username.value,
      email: email.value,
      password: password.value,
    })
    registeredEmail.value = res.email
  } catch (e: any) {
    if (e.message?.toLowerCase().includes('username')) {
      error.value = t('auth.register.usernameExists')
    } else if (e.message?.includes('409') || e.message?.toLowerCase().includes('unique') || e.message?.toLowerCase().includes('already')) {
      error.value = t('auth.register.errorExists')
    } else {
      error.value = e.message || t('auth.register.errorGeneric')
    }
  } finally {
    loading.value = false
  }
}

async function handleResend() {
  resendLoading.value = true
  resendDone.value = false
  try {
    await authApi.resendVerification(registeredEmail.value)
    resendDone.value = true
  } finally {
    resendLoading.value = false
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

    <div class="relative z-10 w-full max-w-[400px] px-6 overflow-y-auto max-h-screen py-8 animate-fade-in">
      <!-- Logo -->
      <div class="flex items-center justify-center gap-3 mb-10">
        <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Music class="w-5 h-5 text-background" :stroke-width="2" />
        </div>
        <span class="font-mono text-2xl font-bold text-foreground leading-none">BackKitchen</span>
      </div>

      <!-- Check email state -->
      <Transition name="slide-fade" mode="out-in">
        <div v-if="registeredEmail" key="check-email" class="bg-card border border-border rounded-none p-8 text-center">
          <div class="w-12 h-12 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-5">
            <Mail class="w-6 h-6 text-success" :stroke-width="2" />
          </div>
          <h1 class="font-mono text-xl font-bold text-foreground mb-2">{{ t('auth.checkEmail.title') }}</h1>
          <p class="text-muted-foreground text-sm font-sans mb-1">{{ t('auth.checkEmail.sentTo') }}</p>
          <p class="text-foreground text-sm font-mono font-semibold mb-5">{{ registeredEmail }}</p>
          <p class="text-muted-foreground text-xs font-sans mb-7">{{ t('auth.checkEmail.hint') }}</p>

          <Transition name="slide-fade">
            <div v-if="resendDone" class="mb-4 px-4 py-2.5 bg-success-bg border border-border text-success text-sm font-sans rounded-none flex items-center justify-center gap-2">
              <CheckCircle2 class="w-4 h-4" :stroke-width="2" />
              {{ t('auth.checkEmail.resent') }}
            </div>
          </Transition>
          <button
            v-if="!resendDone"
            class="btn-secondary w-full flex items-center justify-center gap-2"
            :disabled="resendLoading"
            @click="handleResend"
          >
            <span v-if="resendLoading" class="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin"></span>
            {{ resendLoading ? t('auth.checkEmail.resending') : t('auth.checkEmail.resend') }}
          </button>

          <p class="mt-5 text-center text-sm text-muted-foreground font-sans">
            <RouterLink to="/login" class="text-primary hover:text-primary-hover transition-colors">{{ t('auth.checkEmail.backToSignIn') }}</RouterLink>
          </p>
        </div>

        <!-- Registration form -->
        <div v-else key="register-form" class="bg-card border border-border rounded-none p-8">
          <h1 class="font-mono text-xl font-bold text-foreground mb-1">{{ t('auth.register.title') }}</h1>
          <p class="text-muted-foreground text-sm font-sans mb-7">{{ t('auth.register.subtitle') }}</p>

          <!-- Error -->
          <Transition name="slide-fade">
            <div v-if="error" class="mb-5 px-4 py-3 bg-error-bg border border-error/20 text-error text-sm font-sans rounded-none flex items-start gap-2">
              <AlertCircle class="w-4 h-4 mt-0.5 shrink-0" :stroke-width="2" />
              <span>{{ error }}</span>
            </div>
          </Transition>

          <form @submit.prevent="handleSubmit" class="space-y-5">
            <!-- Username -->
            <div>
              <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.register.username') }}</label>
              <input
                v-model="username"
                type="text"
                class="input-field w-full"
                :class="{ '!border-error !ring-error': usernameTouched && !username }"
                :placeholder="t('auth.register.usernamePlaceholder')"
                autocomplete="username"
                @blur="usernameTouched = true"
              />
            </div>

            <!-- Email -->
            <div>
              <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.register.email') }}</label>
              <input
                v-model="email"
                type="email"
                class="input-field w-full"
                :class="{ '!border-error !ring-error': emailTouched && email && !emailValid }"
                :placeholder="t('auth.register.emailPlaceholder')"
                autocomplete="email"
                @blur="emailTouched = true"
              />
            </div>

            <!-- Password with toggle and hint -->
            <div>
              <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.register.password') }}</label>
              <div class="relative">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="input-field w-full !pr-10"
                  :class="{ '!border-error !ring-error': passwordTouched && password && !passwordLongEnough }"
                  :placeholder="t('auth.register.passwordPlaceholder')"
                  autocomplete="new-password"
                  @blur="passwordTouched = true"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  :title="showPassword ? t('auth.register.hidePassword') : t('auth.register.showPassword')"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="w-4 h-4" :stroke-width="2" />
                  <EyeOff v-else class="w-4 h-4" :stroke-width="2" />
                </button>
              </div>
              <!-- Password length hint -->
              <p
                v-if="passwordTouched || password"
                class="mt-1.5 text-xs font-sans transition-colors"
                :class="passwordLongEnough ? 'text-success' : 'text-muted-foreground'"
              >
                <span class="inline-flex items-center gap-1">
                  <Check v-if="passwordLongEnough" class="w-3 h-3" :stroke-width="2.5" />
                  <Circle v-else class="w-3 h-3" :stroke-width="2.5" />
                  {{ t('auth.register.passwordMinLength') }}
                </span>
              </p>
            </div>

            <!-- Confirm password with toggle -->
            <div>
              <label class="block text-xs text-muted-foreground mb-1 font-sans">{{ t('auth.register.confirmPassword') }}</label>
              <div class="relative">
                <input
                  v-model="confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  class="input-field w-full !pr-10"
                  :class="{ '!border-error !ring-error': confirmTouched && confirmPassword && !passwordsMatch }"
                  :placeholder="t('auth.register.confirmPasswordPlaceholder')"
                  autocomplete="new-password"
                  @blur="confirmTouched = true"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  :title="showConfirmPassword ? t('auth.register.hidePassword') : t('auth.register.showPassword')"
                  @click="showConfirmPassword = !showConfirmPassword"
                >
                  <Eye v-if="!showConfirmPassword" class="w-4 h-4" :stroke-width="2" />
                  <EyeOff v-else class="w-4 h-4" :stroke-width="2" />
                </button>
              </div>
              <!-- Mismatch hint -->
              <p
                v-if="confirmTouched && confirmPassword && !passwordsMatch"
                class="mt-1.5 text-xs font-sans text-error"
              >
                {{ t('auth.register.errorPasswordMismatch') }}
              </p>
            </div>

            <!-- Terms -->
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input v-model="termsAccepted" type="checkbox" class="checkbox mt-0.5" />
              <span class="text-sm text-muted-foreground font-sans leading-relaxed">
                {{ t('auth.register.terms') }}
                <a href="#" class="text-primary hover:text-primary-hover transition-colors">{{ t('auth.register.termsOfService') }}</a>
                {{ t('auth.register.and') }}
                <a href="#" class="text-primary hover:text-primary-hover transition-colors">{{ t('auth.register.privacyPolicy') }}</a>
              </span>
            </label>

            <button
              type="submit"
              class="btn-primary w-full flex items-center justify-center gap-2 font-mono"
              :disabled="loading"
            >
              <span v-if="loading" class="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></span>
              {{ loading ? t('auth.register.creating') : t('auth.register.create') }}
            </button>
          </form>

          <p class="mt-6 text-center text-sm text-muted-foreground font-sans">
            {{ t('auth.register.hasAccount') }}
            <RouterLink to="/login" class="text-primary hover:text-primary-hover ml-1 transition-colors">{{ t('auth.register.signIn') }}</RouterLink>
          </p>
        </div>
      </Transition>
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
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.15s ease-in; }
.slide-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
