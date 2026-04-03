<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'

const router = useRouter()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const termsAccepted = ref(false)
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''

  if (!firstName.value || !email.value || !password.value || !confirmPassword.value) {
    error.value = 'Please fill in all required fields.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.'
    return
  }
  if (!termsAccepted.value) {
    error.value = 'You must accept the terms to continue.'
    return
  }

  loading.value = true
  try {
    await authApi.register({
      firstName: firstName.value,
      lastName: lastName.value,
      email: email.value,
      password: password.value,
    })
    router.push('/login')
  } catch (e: any) {
    if (e.message?.includes('409') || e.message?.toLowerCase().includes('unique') || e.message?.toLowerCase().includes('already')) {
      error.value = 'An account with this email already exists.'
    } else {
      error.value = e.message || 'Registration failed. Please try again.'
    }
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
        Join the community today
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
            Create a free account and start collaborating immediately
          </span>
        </li>
        <li class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#FF8400] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span class="text-[#D4A574] font-sans text-sm leading-relaxed">
            Leave timestamped feedback directly on the waveform
          </span>
        </li>
        <li class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#FF8400] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span class="text-[#D4A574] font-sans text-sm leading-relaxed">
            Track revision history and quality checklists per album
          </span>
        </li>
      </ul>
    </div>

    <!-- Right form panel -->
    <div class="flex-1 flex items-center justify-center px-6 overflow-y-auto py-8">
      <div class="w-full max-w-md">
        <div class="bg-[#1A1A1A] border border-[#2E2E2E] rounded-2xl p-10">
          <h1 class="font-mono text-2xl font-bold text-white mb-1">Create account</h1>
          <p class="text-[#888888] text-sm font-sans mb-8">Fill in the details below to get started</p>

          <!-- Error alert -->
          <div v-if="error" class="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-5">
            <!-- Name row -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-sans text-[#AAAAAA] mb-1.5">First name</label>
                <input
                  v-model="firstName"
                  type="text"
                  class="input-field w-full"
                  placeholder="Ada"
                  autocomplete="given-name"
                />
              </div>
              <div>
                <label class="block text-sm font-sans text-[#AAAAAA] mb-1.5">Last name</label>
                <input
                  v-model="lastName"
                  type="text"
                  class="input-field w-full"
                  placeholder="Lovelace"
                  autocomplete="family-name"
                />
              </div>
            </div>

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
                autocomplete="new-password"
              />
            </div>

            <div>
              <label class="block text-sm font-sans text-[#AAAAAA] mb-1.5">Confirm password</label>
              <input
                v-model="confirmPassword"
                type="password"
                class="input-field w-full"
                placeholder="••••••••"
                autocomplete="new-password"
              />
            </div>

            <label class="flex items-start gap-2.5 cursor-pointer">
              <input v-model="termsAccepted" type="checkbox" class="w-4 h-4 mt-0.5 rounded border-[#444] bg-[#222] accent-[#FF8400] shrink-0" />
              <span class="text-sm text-[#AAAAAA] font-sans leading-relaxed">
                I agree to the <a href="#" class="text-[#FF8400] hover:text-[#FFB366]">Terms of Service</a> and <a href="#" class="text-[#FF8400] hover:text-[#FFB366]">Privacy Policy</a>
              </span>
            </label>

            <button
              type="submit"
              class="btn-primary w-full flex items-center justify-center gap-2"
              :disabled="loading"
            >
              <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ loading ? 'Creating account…' : 'Create Account' }}
            </button>
          </form>

          <p class="mt-7 text-center text-sm text-[#888888] font-sans">
            Already have an account?
            <RouterLink to="/login" class="text-[#FF8400] hover:text-[#FFB366] ml-1">Sign in</RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
