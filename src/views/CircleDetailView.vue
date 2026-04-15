<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- loading -->
    <div v-if="loading">
      <SkeletonLoader :rows="4" :card="true" />
    </div>

    <template v-else-if="circle">
      <!-- header -->
      <div class="flex items-start gap-5 mb-8">
        <div
          class="w-16 h-16 rounded-full overflow-hidden border border-border bg-border flex items-center justify-center shrink-0 relative group"
          :class="{ 'cursor-pointer': isOwner }"
          @click="isOwner && logoInputRef?.click()"
        >
          <img v-if="circle.logo_url" :src="`${API_ORIGIN}/uploads/${circle.logo_url}`" alt="" class="w-full h-full object-cover" />
          <Smile v-else class="w-6 h-6 text-muted-foreground" :stroke-width="1.5" />
          <div v-if="isOwner" class="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Upload class="w-3.5 h-3.5 text-white" :stroke-width="2" />
          </div>
        </div>
        <input v-if="isOwner" ref="logoInputRef" type="file" accept="image/*" class="hidden" @change="uploadLogo" />

        <div class="flex-1">
          <h1 class="text-2xl font-semibold font-mono text-foreground">{{ circle.name }}</h1>
          <p v-if="circle.description" class="text-sm text-muted-foreground mt-1">{{ circle.description }}</p>
          <p v-if="circle.website" class="text-xs text-primary mt-1">{{ circle.website }}</p>
        </div>
      </div>

      <!-- tabs -->
      <div class="flex gap-0 border-b border-border mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="px-5 py-2.5 text-sm font-mono border-b-2 -mb-px transition-colors"
          :class="activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- info tab -->
      <div v-if="activeTab === 'info'" class="flex flex-col gap-6 max-w-xl">
        <div class="bg-card border border-border rounded-none p-6 flex flex-col gap-5">
          <div>
            <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circleDetail.name') }}</label>
            <input
              v-model="editForm.name"
              type="text"
              :disabled="!isOwner"
              class="input-field w-full disabled:opacity-60"
            />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circleDetail.description') }}</label>
            <textarea
              v-model="editForm.description"
              rows="3"
              :disabled="!isOwner"
              class="textarea-field w-full disabled:opacity-60"
            />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circleDetail.website') }}</label>
            <input
              v-model="editForm.website"
              type="text"
              :disabled="!isOwner"
              class="input-field w-full disabled:opacity-60"
            />
          </div>
          <div v-if="isOwner" class="flex justify-end">
            <button class="btn-primary" :disabled="savingInfo" @click="saveInfo">
              {{ savingInfo ? t('common.loading') : t('common.save') }}
            </button>
          </div>
        </div>
      </div>

      <!-- members tab -->
      <div v-if="activeTab === 'members'" class="flex flex-col gap-4 max-w-xl">
        <div class="bg-card border border-border rounded-none">
          <div
            v-for="member in circle.members"
            :key="member.id"
            class="flex items-center gap-3 px-6 py-3 border-b border-border last:border-b-0"
          >
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-semibold shrink-0" :style="{ backgroundColor: member.user.avatar_color }">
              {{ member.user.display_name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-mono text-foreground">{{ member.user.display_name }}</p>
              <p class="text-xs text-muted-foreground">{{ member.user.username }}</p>
            </div>
            <span class="text-xs font-mono px-2 py-0.5 rounded-full" :class="roleBadgeClass(member.role)">
              {{ t(`circleDetail.roles.${member.role}`) }}
            </span>
            <button
              v-if="isOwner && member.user_id !== currentUserId"
              class="text-error text-xs hover:underline"
              @click="removeMember(member.user_id)"
            >
              {{ t('circleDetail.remove') }}
            </button>
          </div>
        </div>
      </div>

      <!-- invite codes tab (owner only) -->
      <div v-if="activeTab === 'invites' && isOwner" class="flex flex-col gap-6 max-w-xl">
        <!-- create new code -->
        <div class="bg-card border border-border rounded-none p-6 flex flex-col gap-4">
          <h2 class="font-mono font-semibold text-sm text-foreground">{{ t('circleDetail.createInvite') }}</h2>
          <div class="flex gap-4 items-end">
            <div class="flex-1">
              <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circleDetail.inviteRole') }}</label>
              <CustomSelect v-model="newCodeRole" :options="roleOptions" />
            </div>
            <div class="flex-1">
              <label class="block text-xs text-muted-foreground mb-2 font-mono">{{ t('circleDetail.expiresDays') }}</label>
              <input
                v-model.number="newCodeDays"
                type="number"
                min="1"
                max="30"
                class="input-field w-full"
              />
            </div>
            <button class="btn-primary shrink-0" :disabled="creatingCode" @click="createInviteCode">
              {{ creatingCode ? t('common.loading') : t('circleDetail.generate') }}
            </button>
          </div>
        </div>

        <!-- existing codes -->
        <div v-if="inviteCodes.length > 0" class="bg-card border border-border rounded-none">
          <div
            v-for="code in inviteCodes"
            :key="code.id"
            class="flex items-center gap-3 px-6 py-3 border-b border-border last:border-b-0"
          >
            <span
              class="font-mono text-sm select-all cursor-pointer px-3 py-1 rounded-full border transition-colors"
              :class="code.is_active ? 'border-border text-foreground hover:border-primary' : 'border-border text-muted-foreground line-through'"
              @click="copyCode(code.code)"
            >
              {{ code.code }}
            </span>
            <span class="text-xs font-mono px-2 py-0.5 rounded-full" :class="code.is_active ? 'bg-success-bg text-success' : 'bg-border text-muted-foreground'">
              {{ code.is_active ? t('circleDetail.active') : t('circleDetail.revoked') }}
            </span>
            <span class="text-xs text-muted-foreground flex-1">
              {{ t(`circleDetail.roles.${code.role}`) }} · {{ t('circleDetail.expires') }} {{ formatDate(code.expires_at) }}
            </span>
            <button v-if="code.is_active" class="text-error text-xs hover:underline" @click="revokeCode(code.id)">
              {{ t('circleDetail.revoke') }}
            </button>
          </div>
        </div>
        <p v-else class="text-muted-foreground text-sm">{{ t('circleDetail.noInvites') }}</p>
      </div>
      <!-- workflow templates tab -->
      <div v-if="activeTab === 'templates'" class="flex flex-col gap-6 max-w-xl">
        <!-- New / edit template form -->
        <div v-if="showNewTemplate" class="bg-card border border-border rounded-none p-6 space-y-4">
          <h2 class="text-sm font-mono font-semibold text-foreground">
            {{ editingTemplate ? t('workflowTemplate.editTemplate') : t('workflowTemplate.createTemplate') }}
          </h2>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowTemplate.templateName') }}</label>
            <input v-model="editTemplateName" class="input-field w-full" :placeholder="t('workflowTemplate.templateNamePlaceholder')" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowTemplate.templateDescription') }}</label>
            <textarea v-model="editTemplateDesc" class="textarea-field w-full h-16" :placeholder="t('workflowTemplate.templateDescriptionPlaceholder')" />
          </div>
          <WorkflowEditor
            v-model:workflow-config="editTemplateConfig"
            :member-options="circleMemberOptions"
          />
          <div class="flex gap-2">
            <button @click="saveTemplate" :disabled="savingTpl || !editTemplateName.trim() || !editTemplateConfig" class="btn-primary text-xs">
              {{ savingTpl ? t('workflowTemplate.saving') : t('workflowTemplate.save') }}
            </button>
            <button @click="showNewTemplate = false" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
          </div>
        </div>

        <!-- Template list -->
        <template v-if="!showNewTemplate">
          <div v-if="isOwner" class="flex justify-end">
            <button @click="startNewTemplate" class="btn-primary text-xs">
              <Plus class="w-3.5 h-3.5 mr-1" /> {{ t('workflowTemplate.createTemplate') }}
            </button>
          </div>

          <div v-if="templates.length === 0" class="text-center py-8">
            <p class="text-sm text-muted-foreground">{{ t('workflowTemplate.noTemplates') }}</p>
            <p class="text-xs text-muted-foreground mt-1">{{ t('workflowTemplate.noTemplatesHint') }}</p>
          </div>

          <div v-for="tpl in templates" :key="tpl.id" class="bg-card border border-border rounded-none p-4 space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-mono font-semibold text-foreground flex-1">{{ tpl.name }}</span>
              <span class="text-xs text-muted-foreground">
                {{ tpl.album_count > 0 ? t('workflowTemplate.albumCount', { count: tpl.album_count }) : t('workflowTemplate.albumCountZero') }}
              </span>
            </div>
            <p v-if="tpl.description" class="text-xs text-muted-foreground">{{ tpl.description }}</p>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{{ tpl.workflow_config.steps.length }} steps</span>
              <span v-if="tpl.created_by_user">{{ t('workflowTemplate.createdBy', { name: tpl.created_by_user.display_name }) }}</span>
            </div>
            <div v-if="isOwner" class="flex gap-2 pt-1">
              <button @click="startEditTemplate(tpl)" class="btn-secondary text-xs">
                <Pencil class="w-3 h-3 mr-1" /> {{ t('workflowTemplate.editTemplate') }}
              </button>
              <button @click="deleteTemplate(tpl)" class="text-xs text-error hover:underline">
                <Trash2 class="w-3 h-3 inline mr-0.5" /> {{ t('workflowTemplate.deleteTemplate') }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- danger zone tab -->
      <div v-if="activeTab === 'danger'" class="flex flex-col gap-4 max-w-xl">
        <div class="bg-card border border-error/40 rounded-none p-6 space-y-4">
          <h3 class="text-sm font-mono font-semibold text-error">{{ t('circleDetail.danger.title') }}</h3>

          <!-- Owner: delete circle -->
          <template v-if="isOwner">
            <div class="space-y-2">
              <p class="text-sm font-mono font-semibold text-foreground">{{ t('circleDetail.danger.deleteTitle') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('circleDetail.danger.deleteDesc') }}</p>
            </div>
            <button
              v-if="!showDeleteConfirm"
              @click="showDeleteConfirm = true"
              class="btn-destructive"
            >
              {{ t('circleDetail.danger.deleteButton') }}
            </button>
            <div v-else class="space-y-2">
              <p class="text-xs text-error">
                {{ t('circleDetail.danger.deleteConfirm', { name: circle.name }) }}
              </p>
              <div class="flex gap-2">
                <button
                  @click="deleteCircle"
                  :disabled="deletingCircle"
                  class="btn-destructive"
                >
                  {{ deletingCircle ? t('common.loading') : t('common.confirm') }}
                </button>
                <button
                  @click="showDeleteConfirm = false"
                  :disabled="deletingCircle"
                  class="btn-secondary text-sm"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </template>

          <!-- Non-owner: leave circle -->
          <template v-else>
            <div class="space-y-2">
              <p class="text-sm font-mono font-semibold text-foreground">{{ t('circleDetail.danger.leaveTitle') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('circleDetail.danger.leaveDesc') }}</p>
            </div>
            <button
              v-if="!showLeaveConfirm"
              @click="showLeaveConfirm = true"
              class="btn-destructive"
            >
              {{ t('circleDetail.danger.leaveButton') }}
            </button>
            <div v-else class="space-y-2">
              <p class="text-xs text-error">
                {{ t('circleDetail.danger.leaveConfirm', { name: circle.name }) }}
              </p>
              <div class="flex gap-2">
                <button
                  @click="leaveCircle"
                  :disabled="leavingCircle"
                  class="btn-destructive"
                >
                  {{ leavingCircle ? t('common.loading') : t('common.confirm') }}
                </button>
                <button
                  @click="showLeaveConfirm = false"
                  :disabled="leavingCircle"
                  class="btn-secondary text-sm"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { circleApi, API_ORIGIN } from '@/api'
import type { Circle, InviteCode, WorkflowConfig, WorkflowTemplate } from '@/types'
import { useToast } from '@/composables/useToast'
import { parseUTC } from '@/utils/time'
import { Smile, Upload, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const toast = useToast()

const loading = ref(true)
const circle = ref<Circle | null>(null)
const inviteCodes = ref<InviteCode[]>([])
const logoInputRef = ref<HTMLInputElement | null>(null)
const activeTab = ref('info')
const savingInfo = ref(false)
const creatingCode = ref(false)
const newCodeRole = ref('member')
const roleOptions = computed(() => [
  { value: 'member', label: t('circleDetail.roles.member') },
  { value: 'mastering_engineer', label: t('circleDetail.roles.mastering_engineer') },
])
const newCodeDays = ref(7)

const editForm = reactive({ name: '', description: '', website: '' })

// Template state
const templates = ref<WorkflowTemplate[]>([])
const editingTemplate = ref<WorkflowTemplate | null>(null)
const editTemplateName = ref('')
const editTemplateDesc = ref('')
const editTemplateConfig = ref<WorkflowConfig | null>(null)
const savingTpl = ref(false)
const showNewTemplate = ref(false)

const currentUserId = computed(() => appStore.currentUser?.id)
const isOwner = computed(() =>
  circle.value ? circle.value.created_by === currentUserId.value : false
)

const tabs = computed(() => {
  const base = [
    { id: 'info', label: t('circleDetail.tabs.info') },
    { id: 'members', label: t('circleDetail.tabs.members') },
  ]
  if (isOwner.value) base.push({ id: 'invites', label: t('circleDetail.tabs.invites') })
  base.push({ id: 'templates', label: t('circleDetail.tabs.templates') })
  base.push({ id: 'danger', label: t('circleDetail.tabs.danger') })
  return base
})

// Danger zone state
const showDeleteConfirm = ref(false)
const showLeaveConfirm = ref(false)
const deletingCircle = ref(false)
const leavingCircle = ref(false)

async function deleteCircle() {
  if (!circle.value) return
  deletingCircle.value = true
  try {
    await circleApi.delete(circle.value.id)
    toast.success(t('circleDetail.danger.deleted'))
    router.push('/circles')
  } catch (e: any) {
    toast.error(e.message || t('circleDetail.danger.deleteFailed'))
  } finally {
    deletingCircle.value = false
  }
}

async function leaveCircle() {
  if (!circle.value) return
  leavingCircle.value = true
  try {
    await circleApi.leave(circle.value.id)
    toast.success(t('circleDetail.danger.left'))
    router.push('/circles')
  } catch (e: any) {
    toast.error(e.message || t('circleDetail.danger.leaveFailed'))
  } finally {
    leavingCircle.value = false
  }
}

const circleMemberOptions = computed(() =>
  (circle.value?.members ?? []).map(member => ({
    value: member.user_id,
    label: member.user.display_name,
  })),
)

onMounted(async () => {
  const id = Number(route.params.circleId)
  try {
    circle.value = await circleApi.get(id)
    editForm.name = circle.value.name
    editForm.description = circle.value.description ?? ''
    editForm.website = circle.value.website ?? ''
    if (circle.value.created_by === currentUserId.value) {
      inviteCodes.value = await circleApi.listInviteCodes(id)
    }
  } catch (e: any) {
    toast.error(e.message || t('common.loadFailed'))
    router.replace('/circles')
  } finally {
    loading.value = false
  }
})

watch(activeTab, (tab) => {
  if (tab === 'templates' && templates.value.length === 0) loadTemplates()
})

function roleBadgeClass(role: string) {
  if (role === 'owner') return 'bg-warning-bg text-warning'
  if (role === 'mastering_engineer') return 'bg-info-bg text-info'
  return 'bg-border text-muted-foreground'
}

async function uploadLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !circle.value) return
  try {
    circle.value = await circleApi.uploadLogo(circle.value.id, file)
    toast.success(t('circleDetail.logoUpdated'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function saveInfo() {
  if (!circle.value) return
  savingInfo.value = true
  try {
    circle.value = await circleApi.update(circle.value.id, {
      name: editForm.name.trim() || undefined,
      description: editForm.description.trim() || null,
      website: editForm.website.trim() || null,
    })
    toast.success(t('common.saved'))
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    savingInfo.value = false
  }
}

async function removeMember(userId: number) {
  if (!circle.value) return
  try {
    await circleApi.removeMember(circle.value.id, userId)
    circle.value.members = circle.value.members.filter(m => m.user_id !== userId)
    toast.success(t('circleDetail.memberRemoved'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function createInviteCode() {
  if (!circle.value) return
  creatingCode.value = true
  try {
    const code = await circleApi.createInviteCode(circle.value.id, {
      role: newCodeRole.value,
      expires_in_days: newCodeDays.value,
    })
    inviteCodes.value.unshift(code)
    toast.success(t('circleDetail.inviteCodeCreated'))
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    creatingCode.value = false
  }
}

async function revokeCode(codeId: number) {
  if (!circle.value) return
  try {
    await circleApi.revokeInviteCode(circle.value.id, codeId)
    const item = inviteCodes.value.find(c => c.id === codeId)
    if (item) item.is_active = false
    toast.success(t('circleDetail.inviteCodeRevoked'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function copyCode(code: string) {
  await navigator.clipboard.writeText(code)
  toast.success(t('circleDetail.codeCopied'))
}

async function loadTemplates() {
  if (!circle.value) return
  templates.value = await circleApi.listWorkflowTemplates(circle.value.id)
}

function startNewTemplate() {
  editingTemplate.value = null
  editTemplateName.value = ''
  editTemplateDesc.value = ''
  editTemplateConfig.value = null
  showNewTemplate.value = true
}

function startEditTemplate(tpl: WorkflowTemplate) {
  editingTemplate.value = tpl
  editTemplateName.value = tpl.name
  editTemplateDesc.value = tpl.description ?? ''
  editTemplateConfig.value = JSON.parse(JSON.stringify(tpl.workflow_config))
  showNewTemplate.value = true
}

async function saveTemplate() {
  if (!circle.value || !editTemplateName.value.trim() || !editTemplateConfig.value) return
  savingTpl.value = true
  try {
    if (editingTemplate.value) {
      // Editing existing — check album_count for soft prompt
      if (editingTemplate.value.album_count > 0) {
        const confirmed = confirm(t('workflowTemplate.editWarning', { count: editingTemplate.value.album_count }))
        if (!confirmed) { savingTpl.value = false; return }
      }
      await circleApi.updateWorkflowTemplate(circle.value.id, editingTemplate.value.id, {
        name: editTemplateName.value.trim(),
        description: editTemplateDesc.value.trim() || null,
        workflow_config: editTemplateConfig.value,
      })
    } else {
      await circleApi.createWorkflowTemplate(circle.value.id, {
        name: editTemplateName.value.trim(),
        description: editTemplateDesc.value.trim() || null,
        workflow_config: editTemplateConfig.value,
      })
    }
    toast.success(t('workflowTemplate.saved'))
    showNewTemplate.value = false
    await loadTemplates()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    savingTpl.value = false
  }
}

async function deleteTemplate(tpl: WorkflowTemplate) {
  if (!circle.value) return
  if (!confirm(t('workflowTemplate.deleteConfirm', { name: tpl.name }))) return
  try {
    await circleApi.deleteWorkflowTemplate(circle.value.id, tpl.id)
    toast.success(t('workflowTemplate.deleted'))
    await loadTemplates()
  } catch (e: any) {
    toast.error(e.message)
  }
}

function formatDate(iso: string) {
  return parseUTC(iso).toLocaleDateString()
}
</script>
