<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminApi } from '@/api'
import { useToast } from '@/composables/useToast'
import type { User, UserRole } from '@/types'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const toast = useToast()

const users = ref<User[]>([])
const loading = ref(true)
const deletingId = ref<number | null>(null)

onMounted(async () => {
  if (!appStore.currentUser?.is_admin) {
    router.replace('/')
    return
  }
  try {
    users.value = await adminApi.listUsers()
  } finally {
    loading.value = false
  }
})

async function onRoleChange(user: User, newRole: UserRole) {
  try {
    const updated = await adminApi.updateUser(user.id, { role: newRole })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function onAdminToggle(user: User) {
  try {
    const updated = await adminApi.updateUser(user.id, { is_admin: !user.is_admin })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function onVerifiedToggle(user: User) {
  try {
    const updated = await adminApi.updateUser(user.id, { email_verified: !user.email_verified })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function onDelete(user: User) {
  if (!confirm(t('admin.confirmDelete', { name: user.display_name }))) return
  deletingId.value = user.id
  try {
    await adminApi.deleteUser(user.id)
    users.value = users.value.filter(u => u.id !== user.id)
    toast.success(t('admin.deleteSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    deletingId.value = null
  }
}

const isSelf = (user: User) => user.id === appStore.currentUser?.id

const roleOptions: { value: UserRole; labelKey: string }[] = [
  { value: 'member', labelKey: 'roles.member' },
  { value: 'producer', labelKey: 'roles.producer' },
  { value: 'mastering_engineer', labelKey: 'roles.masteringEngineer' },
]
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('admin.title') }}</h1>

    <div v-if="loading" class="text-muted-foreground text-sm">{{ t('common.loading') }}</div>

    <div v-else class="card">
      <h2 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('admin.userManagement') }}</h2>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-muted-foreground">
              <th class="pb-3 pr-4">{{ t('admin.displayName') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.username') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.email') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.role') }}</th>
              <th class="pb-3 pr-4 text-center">{{ t('admin.adminFlag') }}</th>
              <th class="pb-3 pr-4 text-center">{{ t('admin.verified') }}</th>
              <th class="pb-3">{{ t('admin.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-border last:border-0"
            >
              <!-- Display name + avatar -->
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <div
                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    :style="{ backgroundColor: user.avatar_color }"
                  >
                    {{ user.display_name.charAt(0) }}
                  </div>
                  <span class="text-foreground">{{ user.display_name }}</span>
                </div>
              </td>

              <!-- Username -->
              <td class="py-3 pr-4 text-muted-foreground">{{ user.username }}</td>

              <!-- Email -->
              <td class="py-3 pr-4 text-muted-foreground">{{ user.email || '—' }}</td>

              <!-- Role -->
              <td class="py-3 pr-4">
                <select
                  class="select-field-sm"
                  :value="user.role"
                  @change="onRoleChange(user, ($event.target as HTMLSelectElement).value as UserRole)"
                >
                  <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </td>

              <!-- Admin toggle -->
              <td class="py-3 pr-4 text-center">
                <button
                  class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                  :class="user.is_admin ? 'bg-primary border-primary' : 'bg-background'"
                  :disabled="isSelf(user)"
                  :title="isSelf(user) ? '' : t('admin.adminFlag')"
                  @click="!isSelf(user) && onAdminToggle(user)"
                >
                  <svg v-if="user.is_admin" class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </td>

              <!-- Email verified toggle -->
              <td class="py-3 pr-4 text-center">
                <button
                  class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                  :class="user.email_verified ? 'bg-primary border-primary' : 'bg-background'"
                  @click="onVerifiedToggle(user)"
                >
                  <svg v-if="user.email_verified" class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </td>

              <!-- Actions -->
              <td class="py-3">
                <button
                  v-if="!isSelf(user)"
                  class="text-xs text-error hover:text-error/80 transition-colors font-mono"
                  :disabled="deletingId === user.id"
                  @click="onDelete(user)"
                >
                  {{ t('admin.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
