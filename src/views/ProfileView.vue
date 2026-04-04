<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api'
import { useAppStore } from '@/stores/app'

const { t, locale } = useI18n()
const appStore = useAppStore()

type Tab = 'profile' | 'security' | 'preferences'
const activeTab = ref<Tab>('profile')

const profileForm = reactive({
  display_name: appStore.currentUser?.display_name ?? '',
  email: appStore.currentUser?.email ?? '',
})

watch(
  () => appStore.currentUser,
  (user) => {
    if (user) {
      profileForm.display_name = user.display_name
      profileForm.email = user.email ?? ''
    }
  },
)
const profileSaving = ref(false)
const profileError = ref('')
const profileSuccess = ref('')

const passwordForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: '',
})
const passwordSaving = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

const avatarInitial = computed(() => {
  const name = appStore.currentUser?.display_name ?? ''
  return name.charAt(0).toUpperCase() || '?'
})

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'mastering_engineer') return t('roles.masteringEngineer')
  if (role === 'producer') return t('roles.producer')
  return t('roles.member')
})

const joinDate = computed(() => {
  const d = appStore.currentUser?.created_at
  if (!d) return '—'
  return new Date(d).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
})

async function saveProfile() {
  profileError.value = ''
  profileSuccess.value = ''
  profileSaving.value = true
  try {
    const updated = await authApi.updateProfile({
      display_name: profileForm.display_name,
      email: profileForm.email || undefined,
    })
    appStore.setAuth(updated, appStore.token!)
    profileSuccess.value = t('profile.saveSuccess')
  } catch (err: any) {
    profileError.value = err.message || t('profile.saveError')
  } finally {
    profileSaving.value = false
  }
}

async function changePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    passwordError.value = t('profile.passwordMismatch')
    return
  }
  passwordSaving.value = true
  try {
    await authApi.changePassword({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
    })
    passwordSuccess.value = t('profile.passwordChanged')
    passwordForm.current_password = ''
    passwordForm.new_password = ''
    passwordForm.confirm_password = ''
  } catch (err: any) {
    passwordError.value = err.message || t('profile.passwordError')
  } finally {
    passwordSaving.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Profile Hero -->
    <div class="flex items-center gap-6">
      <div
        class="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold font-mono text-foreground shrink-0"
        :style="{ backgroundColor: appStore.currentUser?.avatar_color || '#2E2E2E' }"
      >
        {{ avatarInitial }}
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-mono font-bold text-foreground truncate">
          {{ appStore.currentUser?.display_name }}
        </h1>
        <div class="flex items-center gap-3 mt-1 flex-wrap">
          <span class="text-sm text-muted-foreground">@{{ appStore.currentUser?.username }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
            {{ roleLabel }}
          </span>
        </div>
        <p class="text-xs text-muted-foreground mt-1">{{ t('profile.joinedAt', { date: joinDate }) }}</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-card border border-border rounded-full p-1 w-fit">
      <button
        v-for="tab in (['profile', 'security', 'preferences'] as Tab[])"
        :key="tab"
        @click="activeTab = tab"
        :class="[
          'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
          activeTab === tab
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        {{ t(`profile.tabs.${tab}`) }}
      </button>
    </div>

    <!-- Tab: 基本信息 -->
    <template v-if="activeTab === 'profile'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <!-- Basic Info Form -->
        <section class="card space-y-5 lg:col-span-2">
          <div>
            <h2 class="text-base font-mono font-semibold text-foreground">{{ t('profile.basicInfo') }}</h2>
            <p class="text-xs text-muted-foreground mt-0.5">{{ t('profile.basicInfoDesc') }}</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.displayName') }}</label>
              <input v-model="profileForm.display_name" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.username') }}</label>
              <input :value="appStore.currentUser?.username" disabled class="input-field w-full opacity-50 cursor-not-allowed" />
            </div>
          </div>

          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.email') }}</label>
            <input v-model="profileForm.email" type="email" class="input-field w-full" />
          </div>

          <div v-if="profileError" class="text-xs text-destructive">{{ profileError }}</div>
          <div v-if="profileSuccess" class="text-xs text-success">{{ profileSuccess }}</div>

          <div class="flex justify-end">
            <button @click="saveProfile" :disabled="profileSaving" class="btn-primary text-sm">
              {{ profileSaving ? t('profile.saving') : t('profile.save') }}
            </button>
          </div>
        </section>

        <!-- Role & Stats -->
        <section class="card space-y-4">
          <div>
            <h2 class="text-base font-mono font-semibold text-foreground">{{ t('profile.roleInfo') }}</h2>
            <p class="text-xs text-muted-foreground mt-0.5">{{ t('profile.roleInfoDesc') }}</p>
          </div>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">{{ t('profile.currentRole') }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                {{ roleLabel }}
              </span>
            </div>
            <div class="flex items-center justify-between border-t border-border pt-3">
              <span class="text-muted-foreground">{{ t('profile.userId') }}</span>
              <span class="font-mono text-foreground">#{{ appStore.currentUser?.id }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-border pt-3">
              <span class="text-muted-foreground">{{ t('profile.joinedLabel') }}</span>
              <span class="font-mono text-xs text-foreground">{{ joinDate }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- Tab: 安全设置 -->
    <template v-if="activeTab === 'security'">
      <section class="card max-w-lg space-y-5">
        <div>
          <h2 class="text-base font-mono font-semibold text-foreground">{{ t('profile.changePassword') }}</h2>
          <p class="text-xs text-muted-foreground mt-0.5">{{ t('profile.changePasswordDesc') }}</p>
        </div>

        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.currentPassword') }}</label>
          <input v-model="passwordForm.current_password" type="password" class="input-field w-full" autocomplete="current-password" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.newPassword') }}</label>
          <input v-model="passwordForm.new_password" type="password" class="input-field w-full" autocomplete="new-password" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('profile.confirmPassword') }}</label>
          <input v-model="passwordForm.confirm_password" type="password" class="input-field w-full" autocomplete="new-password" />
        </div>

        <div v-if="passwordError" class="text-xs text-destructive">{{ passwordError }}</div>
        <div v-if="passwordSuccess" class="text-xs text-success">{{ passwordSuccess }}</div>

        <div class="flex justify-end">
          <button @click="changePassword" :disabled="passwordSaving" class="btn-primary text-sm">
            {{ passwordSaving ? t('profile.saving') : t('profile.changePasswordBtn') }}
          </button>
        </div>
      </section>
    </template>

    <!-- Tab: 偏好设置 -->
    <template v-if="activeTab === 'preferences'">
      <section class="card max-w-lg space-y-5">
        <div>
          <h2 class="text-base font-mono font-semibold text-foreground">{{ t('profile.preferences') }}</h2>
          <p class="text-xs text-muted-foreground mt-0.5">{{ t('profile.preferencesDesc') }}</p>
        </div>
        <div class="text-sm text-muted-foreground">{{ t('profile.preferencesComingSoon') }}</div>
      </section>
    </template>
  </div>
</template>
