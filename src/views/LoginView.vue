<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = 'Please enter your email and password.'
    return
  }
  loading.value = true
  try {
    const auth = await authApi.login(email.value, password.value)
    appStore.setAuth(auth.user, auth.access_token)
    router.push('/')
  } catch (e: any) {
    error.value = e.message || 'Invalid email or password.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex h-screen w-screen bg-[#111111]">
    <!-- Left brand panel -->
    <div
      class="hidden lg:flex flex-col justify-center px-16 w-[560px] shrink-0"
      style="background: linear-gradient(160deg, #331A00, #1A0A00)"
    >
      <!-- Logo -->
      <div class="flex items-center gap-4 mb-10">
        <div class="w-14 h-14 rounded-full bg-[#FF8400] flex items-center justify-center shrink-0">
          <svg class="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <span class="font-mono text-[42px] font-bold text-white leading-none">BackKitchen</span>
      </div>

      <p class="text-[#CC8844] text-lg mb-6 font-sans">
        Streamline your doujin music review workflow
      </p>

      <!-- Divider -->
      <div class="w-12 h-0.5 bg-[#FF8400] mb-8"></div>

      <!-- Feature bullets -->
      <ul class="space-y-5">
        <li class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#FF8400] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span class="text-[#D4A574] font-sans text-sm leading-relaxed">
            Waveform-based review with timestamped issue markers
          </span>
        </li>
        <li class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#FF8400] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span class="text-[#D4A574] font-sans text-sm leading-relaxed">
            Structured workflow: submit → review → revise → approve
          </span>
        </li>
        <li class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#FF8400] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span class="text-[#D4A574] font-sans text-sm leading-relaxed">
            Real-time collaboration across producers, authors, and reviewers
          </span>
        </li>
      </ul>
    </div>

    <!-- Right form panel -->
    <div class="flex-1 flex items-center justify-center px-6">
      <div class="w-full max-w-md">
        <div class="bg-[#1A1A1A] border border-[#2E2E2E] rounded-2xl p-10">
          <h1 class="font-mono text-2xl font-bold text-white mb-1">Welcome back</h1>
          <p class="text-[#888888] text-sm font-sans mb-8">Sign in to your account to continue</p>

          <!-- Error alert -->
          <div v-if="error" class="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-5">
            <div>
              <label class="block text-sm font-sans text-[#AAAAAA] mb-1.5">Email address</label>
              <input
                v-model="email"
                type="email"
                class="input-field w-full"
                placeholder="you@example.com"
                autocomplete="email"
              />
            </div>

            <div>
              <label class="block text-sm font-sans text-[#AAAAAA] mb-1.5">Password</label>
              <input
                v-model="password"
                type="password"
                class="input-field w-full"
                placeholder="••••••••"
                autocomplete="current-password"
              />
            </div>

            <div class="flex items-center justify-between">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="rememberMe" type="checkbox" class="w-4 h-4 rounded border-[#444] bg-[#222] accent-[#FF8400]" />
                <span class="text-sm text-[#AAAAAA] font-sans">Remember me</span>
              </label>
              <a href="#" class="text-sm text-[#FF8400] hover:text-[#FFB366] font-sans">Forgot password?</a>
            </div>

            <button
              type="submit"
              class="btn-primary w-full flex items-center justify-center gap-2"
              :disabled="loading"
            >
              <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ loading ? 'Signing in…' : 'Sign In' }}
            </button>
          </form>

          <!-- Divider -->
          <div class="flex items-center gap-3 my-7">
            <div class="flex-1 h-px bg-[#2E2E2E]"></div>
            <span class="text-[#555555] text-xs font-sans">or</span>
            <div class="flex-1 h-px bg-[#2E2E2E]"></div>
          </div>

          <p class="text-center text-sm text-[#888888] font-sans">
            Don't have an account?
            <RouterLink to="/register" class="text-[#FF8400] hover:text-[#FFB366] ml-1">Register now</RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
