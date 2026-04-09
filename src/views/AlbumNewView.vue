<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, circleApi, userApi } from '@/api'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { useAppStore } from '@/stores/app'
import type { CircleSummary, User, WorkflowConfig, WorkflowTemplate } from '@/types'
import { ChevronLeft, Upload, ChevronDown, ChevronRight, HelpCircle, BookTemplate, Save } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()

const loading = ref(true)
const creating = ref(false)
const users = ref<User[]>([])

const form = ref({ title: '', description: '' })
const titleError = ref('')

const coverInputRef = ref<HTMLInputElement | null>(null)
const coverImageFile = ref<File | null>(null)
const coverPreviewUrl = ref<string | null>(null)

const teamState = reactive<{ mastering_engineer_id: number | null; member_ids: number[] }>({
  mastering_engineer_id: null,
  member_ids: [],
})

const deadlineState = reactive({ deadline: '', peer_review: '', mastering: '', final_review: '' })

const showWorkflowBuilder = ref(false)
const showWorkflowGuide = ref(false)
const workflowConfig = ref<WorkflowConfig | null>(null)
const selectedCircleId = ref<number | null>(null)
const circles = ref<CircleSummary[]>([])

// Template state
const templates = ref<WorkflowTemplate[]>([])
const showTemplateList = ref(false)
const showSaveTemplate = ref(false)
const saveTemplateName = ref('')
const saveTemplateDesc = ref('')
const savingTemplate = ref(false)
const selectedTemplateId = ref<number | null>(null)

const userOptions = computed<SelectOption[]>(() =>
  users.value.map((u) => ({ value: u.id, label: u.display_name }))
)

const circleOptions = computed<SelectOption[]>(() =>
  circles.value.map((c) => ({ value: c.id, label: c.name }))
)

const workflowMemberOptions = computed<SelectOption[]>(() => {
  const byId = new Map<number, SelectOption>()

  const currentUser = appStore.currentUser
  if (currentUser) {
    byId.set(currentUser.id, { value: currentUser.id, label: currentUser.display_name })
  }

  if (teamState.mastering_engineer_id) {
    const mastering = users.value.find(user => user.id === teamState.mastering_engineer_id)
    if (mastering) {
      byId.set(mastering.id, { value: mastering.id, label: mastering.display_name })
    }
  }

  for (const memberId of teamState.member_ids) {
    const member = users.value.find(user => user.id === memberId)
    if (member) {
      byId.set(member.id, { value: member.id, label: member.display_name })
    }
  }

  return Array.from(byId.values())
})

onMounted(async () => {
  if (appStore.currentUser?.role !== 'producer') {
    router.replace('/albums')
    return
  }
  loading.value = true
  try {
    const [userList, circleList] = await Promise.all([userApi.list(), circleApi.list()])
    users.value = userList
    circles.value = circleList
  } finally {
    loading.value = false
  }
})

async function loadTemplates() {
  if (!selectedCircleId.value) return
  templates.value = await circleApi.listWorkflowTemplates(selectedCircleId.value)
}

async function loadFromTemplate(template: WorkflowTemplate) {
  workflowConfig.value = JSON.parse(JSON.stringify(template.workflow_config))
  selectedTemplateId.value = template.id
  showTemplateList.value = false
}

async function openTemplateList() {
  await loadTemplates()
  showTemplateList.value = true
}

async function saveAsTemplate() {
  if (!selectedCircleId.value || !workflowConfig.value || !saveTemplateName.value.trim()) return
  savingTemplate.value = true
  try {
    await circleApi.createWorkflowTemplate(selectedCircleId.value, {
      name: saveTemplateName.value.trim(),
      description: saveTemplateDesc.value.trim() || null,
      workflow_config: workflowConfig.value,
    })
    showSaveTemplate.value = false
    saveTemplateName.value = ''
    saveTemplateDesc.value = ''
  } finally {
    savingTemplate.value = false
  }
}

onUnmounted(() => {
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
})

function handleCoverSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  coverImageFile.value = file
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
  coverPreviewUrl.value = URL.createObjectURL(file)
}

function toggleMember(userId: number) {
  if (teamState.member_ids.includes(userId)) {
    teamState.member_ids = teamState.member_ids.filter(id => id !== userId)
  } else {
    teamState.member_ids = [...teamState.member_ids, userId]
  }
}

async function create() {
  titleError.value = ''
  if (!form.value.title.trim()) {
    titleError.value = t('albumNew.titleRequired')
    return
  }
  creating.value = true
  try {
    const payload: any = { ...form.value }
    if (selectedCircleId.value) {
      payload.circle_id = selectedCircleId.value
    }
    if (showWorkflowBuilder.value && workflowConfig.value) {
      payload.workflow_config = workflowConfig.value
      if (selectedTemplateId.value) {
        payload.workflow_template_id = selectedTemplateId.value
      }
    }
    const album = await albumApi.create(payload)

    const tasks: Promise<any>[] = []

    if (coverImageFile.value) {
      tasks.push(albumApi.uploadCover(album.id, coverImageFile.value))
    }

    const hasTeam = teamState.mastering_engineer_id !== null || teamState.member_ids.length > 0
    if (hasTeam) {
      tasks.push(albumApi.updateTeam(album.id, teamState))
    }

    const hasDeadline = deadlineState.deadline || deadlineState.peer_review ||
      deadlineState.mastering || deadlineState.final_review
    if (hasDeadline) {
      const phaseDeadlines: Record<string, string> = {}
      if (deadlineState.peer_review) phaseDeadlines.peer_review = new Date(deadlineState.peer_review).toISOString()
      if (deadlineState.mastering) phaseDeadlines.mastering = new Date(deadlineState.mastering).toISOString()
      if (deadlineState.final_review) phaseDeadlines.final_review = new Date(deadlineState.final_review).toISOString()
      tasks.push(albumApi.updateDeadlines(album.id, {
        deadline: deadlineState.deadline ? new Date(deadlineState.deadline).toISOString() : null,
        phase_deadlines: Object.keys(phaseDeadlines).length ? phaseDeadlines : null,
      }))
    }

    await Promise.all(tasks)
    router.push(`/albums/${album.id}/settings`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <RouterLink to="/albums" class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
        <ChevronLeft class="w-5 h-5" :stroke-width="2" />
      </RouterLink>
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('albumNew.heading') }}</h1>
    </div>

    <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

    <template v-else>
      <!-- 基本信息 -->
      <div class="card space-y-5">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.basicInfo') }}</h2>

        <div class="flex items-start gap-5">
          <!-- 封面预览 -->
          <div class="flex-shrink-0 space-y-1.5">
            <div
              class="relative w-24 h-24 overflow-hidden border border-border cursor-pointer group"
              @click="coverInputRef?.click()"
            >
              <img
                :src="coverPreviewUrl || albumPlaceholder"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload class="w-6 h-6 text-white" :stroke-width="2" />
              </div>
            </div>
            <p class="text-xs text-muted-foreground text-center w-24">{{ t('albumNew.coverImageHint') }}</p>
            <input ref="coverInputRef" type="file" accept="image/*" class="hidden" @change="handleCoverSelect" />
          </div>

          <!-- 标题 + 描述 + 颜色 -->
          <div class="flex-1 space-y-3">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.albumTitle') }}</label>
              <input
                v-model="form.title"
                class="input-field w-full"
                :placeholder="t('albumNew.albumTitlePlaceholder')"
                @keyup.enter="create"
              />
              <p v-if="titleError" class="text-xs text-error mt-1">{{ titleError }}</p>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.description') }}</label>
          <textarea
            v-model="form.description"
            class="textarea-field w-full h-20"
            :placeholder="t('albumNew.descriptionPlaceholder')"
          />
        </div>
      </div>

      <!-- 社团 -->
      <div v-if="circles.length" class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('settings.circleName') }}</h2>
        <CustomSelect v-model="selectedCircleId" :options="circleOptions" :placeholder="t('settings.noneOption')" />
      </div>

      <!-- 团队 -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.teamSection') }}</h2>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringEngineerSelect') }}</label>
          <CustomSelect v-model="teamState.mastering_engineer_id" :options="userOptions" :placeholder="t('settings.noneOption')" />
        </div>
        <div>
          <div class="text-xs text-muted-foreground mb-2">{{ t('settings.participants') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              v-for="user in users"
              :key="user.id"
              class="flex items-center gap-2 text-sm text-foreground cursor-pointer"
            >
              <input
                type="checkbox"
                class="checkbox"
                :checked="teamState.member_ids.includes(user.id)"
                @change="toggleMember(user.id)"
              />
              <span>{{ user.display_name }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 截止日期 -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.deadlinesSection') }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumDeadline') }}</label>
            <input v-model="deadlineState.deadline" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.peerReviewDeadline') }}</label>
            <input v-model="deadlineState.peer_review" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringDeadline') }}</label>
            <input v-model="deadlineState.mastering" type="date" class="input-field w-full" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.finalReviewDeadline') }}</label>
            <input v-model="deadlineState.final_review" type="date" class="input-field w-full" />
          </div>
        </div>
      </div>

      <!-- Workflow -->
      <div class="card space-y-4">
        <button
          @click="showWorkflowBuilder = !showWorkflowBuilder"
          class="flex items-center gap-2 w-full text-left"
        >
          <component :is="showWorkflowBuilder ? ChevronDown : ChevronRight" class="w-4 h-4 text-muted-foreground" />
          <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('albumNew.workflowSection') }}</h2>
          <span v-if="!showWorkflowBuilder" class="text-xs text-muted-foreground ml-auto">{{ t('albumNew.workflowUsingDefault') }}</span>
        </button>
        <template v-if="showWorkflowBuilder">
          <p class="text-xs text-muted-foreground">
            {{ t('albumNew.workflowDesc') }}
          </p>

          <!-- Configuration Guide -->
          <div class="border border-border bg-background rounded-none">
            <button
              @click="showWorkflowGuide = !showWorkflowGuide"
              class="flex items-center gap-2 w-full text-left px-3 py-2"
            >
              <HelpCircle class="w-3.5 h-3.5 text-info" />
              <span class="text-xs font-mono font-medium text-info">{{ t('workflowBuilder.guide.title') }}</span>
              <component :is="showWorkflowGuide ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </button>
            <div v-if="showWorkflowGuide" class="px-3 pb-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.basicsTitle') }}</p>
                <p>{{ t('workflowBuilder.guide.basicsDesc') }}</p>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.stageTypesTitle') }}</p>
                <ul class="space-y-1 list-disc list-inside">
                  <li>{{ t('workflowBuilder.guide.stageIntake') }}</li>
                  <li>{{ t('workflowBuilder.guide.stagePeerReview') }}</li>
                  <li>{{ t('workflowBuilder.guide.stageProducerGate') }}</li>
                  <li>{{ t('workflowBuilder.guide.stageMastering') }}</li>
                  <li>{{ t('workflowBuilder.guide.stageFinalReview') }}</li>
                </ul>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.rolesTitle') }}</p>
                <p>{{ t('workflowBuilder.guide.rolesDesc') }}</p>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.revisionTitle') }}</p>
                <p>{{ t('workflowBuilder.guide.revisionDesc') }}</p>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.reviewSettingsTitle') }}</p>
                <p>{{ t('workflowBuilder.guide.reviewSettingsDesc') }}</p>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.rejectTargetsTitle') }}</p>
                <p>{{ t('workflowBuilder.guide.rejectTargetsDesc') }}</p>
              </div>
              <div>
                <p class="font-mono font-semibold text-foreground mb-1">{{ t('workflowBuilder.guide.notesTitle') }}</p>
                <ul class="space-y-1 list-disc list-inside">
                  <li>{{ t('workflowBuilder.guide.note1') }}</li>
                  <li>{{ t('workflowBuilder.guide.note2') }}</li>
                  <li>{{ t('workflowBuilder.guide.note3') }}</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Template load/save buttons -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-if="selectedCircleId"
              @click="openTemplateList"
              class="btn-secondary text-xs"
            >
              <BookTemplate class="w-3.5 h-3.5 mr-1" /> {{ t('workflowTemplate.loadFromTemplate') }}
            </button>
            <button
              v-if="selectedCircleId && workflowConfig"
              @click="showSaveTemplate = true"
              class="btn-secondary text-xs"
            >
              <Save class="w-3.5 h-3.5 mr-1" /> {{ t('workflowTemplate.saveAsTemplate') }}
            </button>
            <span v-if="!selectedCircleId" class="text-xs text-muted-foreground">
              {{ t('workflowTemplate.noCircleHint') }}
            </span>
          </div>

          <!-- Template list modal -->
          <div v-if="showTemplateList" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showTemplateList = false">
            <div class="bg-card border border-border rounded-none p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4">
              <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowTemplate.selectTemplate') }}</h3>
              <div v-if="templates.length === 0" class="text-sm text-muted-foreground py-4 text-center">
                {{ t('workflowTemplate.noTemplates') }}
              </div>
              <div v-for="tpl in templates" :key="tpl.id" class="border border-border p-3 space-y-1 hover:bg-background/50 cursor-pointer transition-colors" @click="loadFromTemplate(tpl)">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-mono font-semibold text-foreground">{{ tpl.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ t('workflowTemplate.stepCount', { count: tpl.workflow_config.steps.length }) }}</span>
                </div>
                <p v-if="tpl.description" class="text-xs text-muted-foreground">{{ tpl.description }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ tpl.album_count > 0 ? t('workflowTemplate.albumCount', { count: tpl.album_count }) : t('workflowTemplate.albumCountZero') }}
                </p>
              </div>
              <button @click="showTemplateList = false" class="btn-secondary text-xs w-full">{{ t('common.cancel') }}</button>
            </div>
          </div>

          <!-- Save template modal -->
          <div v-if="showSaveTemplate" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showSaveTemplate = false">
            <div class="bg-card border border-border rounded-none p-6 w-full max-w-md space-y-4">
              <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowTemplate.saveAsTemplate') }}</h3>
              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowTemplate.templateName') }}</label>
                <input v-model="saveTemplateName" class="input-field w-full" :placeholder="t('workflowTemplate.templateNamePlaceholder')" />
              </div>
              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowTemplate.templateDescription') }}</label>
                <textarea v-model="saveTemplateDesc" class="textarea-field w-full h-16" :placeholder="t('workflowTemplate.templateDescriptionPlaceholder')" />
              </div>
              <div class="flex gap-2">
                <button @click="saveAsTemplate" :disabled="savingTemplate || !saveTemplateName.trim()" class="btn-primary text-xs flex-1">
                  {{ savingTemplate ? t('workflowTemplate.saving') : t('workflowTemplate.save') }}
                </button>
                <button @click="showSaveTemplate = false" class="btn-secondary text-xs flex-1">{{ t('common.cancel') }}</button>
              </div>
            </div>
          </div>

          <WorkflowEditor
            v-model:workflow-config="workflowConfig"
            :member-options="workflowMemberOptions"
          />
          <p v-if="workflowConfig" class="text-xs text-success">{{ t('albumNew.workflowValid') }}</p>
        </template>
      </div>

      <button @click="create" :disabled="creating" class="btn-primary text-sm w-full">
        {{ creating ? t('albumNew.creating') : t('albumNew.createButton') }}
      </button>
    </template>
  </div>
</template>
