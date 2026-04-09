<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, X, GripVertical } from 'lucide-vue-next'
import type { WorkflowConfig, WorkflowStepDef } from '@/types'
import type { AlbumMember } from '@/types'

/**
 * Simplified editor stage — revision stages are auto-managed,
 * not shown as separate items. Transitions are auto-computed
 * from stage order and configuration.
 */
interface EditorStage {
  id: string
  label: string
  type: 'review' | 'approval' | 'delivery'
  assignee_role: string
  // Review
  assignment_mode: 'manual' | 'auto'
  reviewer_pool: number[]
  required_reviewer_count: number
  // Approval
  allow_permanent_reject: boolean
  // Delivery
  require_confirmation: boolean
  // Assignee override
  assignee_user_id: number | null
  // Revision pairing
  has_revision: boolean
  revision_label: string
  revision_assignee_role: string
}

const props = defineProps<{
  workflowConfig: WorkflowConfig | null
  albumMembers: AlbumMember[]
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [config: WorkflowConfig]
}>()

const { t } = useI18n()

// ── Parse existing config into editor state ──

function parseConfigToStages(config: WorkflowConfig | null): EditorStage[] {
  if (!config) return []

  const steps = config.steps
  const revisionSteps = new Map<string, WorkflowStepDef>()
  const mainSteps: WorkflowStepDef[] = []

  // Separate revision steps
  for (const step of steps) {
    if (step.type === 'revision') {
      revisionSteps.set(step.id, step)
    } else {
      mainSteps.push(step)
    }
  }
  mainSteps.sort((a, b) => a.order - b.order)

  return mainSteps.map(step => {
    // Find paired revision step
    const revisionTargets = Object.values(step.transitions).filter(
      t => revisionSteps.has(t)
    )
    const pairedRevision = revisionTargets.length > 0
      ? revisionSteps.get(revisionTargets[0])
      : null

    const normalizedType = (step.type === 'gate' ? 'approval' : step.type) as EditorStage['type']

    return {
      id: step.id,
      label: step.label,
      type: normalizedType,
      assignee_role: step.assignee_role,
      assignment_mode: (step.assignment_mode ?? 'manual') as 'manual' | 'auto',
      reviewer_pool: step.reviewer_pool ?? [],
      required_reviewer_count: step.required_reviewer_count ?? 1,
      allow_permanent_reject: step.allow_permanent_reject ?? false,
      require_confirmation: step.require_confirmation ?? false,
      assignee_user_id: step.assignee_user_id ?? null,
      has_revision: !!pairedRevision,
      revision_label: pairedRevision?.label ?? `${step.label} Revision`,
      revision_assignee_role: pairedRevision?.assignee_role ?? 'submitter',
    }
  })
}

const stages = ref<EditorStage[]>(parseConfigToStages(props.workflowConfig))
const editingIndex = ref<number | null>(null)
const addingStage = ref(false)
const hasChanges = ref(false)

watch(() => props.workflowConfig, (config) => {
  stages.value = parseConfigToStages(config)
  hasChanges.value = false
}, { deep: true })

function markChanged() {
  hasChanges.value = true
}

function loadDefaultWorkflow() {
  const defaultConfig: WorkflowConfig = {
    version: 2,
    steps: [
      { id: 'intake', label: 'Intake', type: 'approval', assignee_role: 'producer', order: 0, transitions: { accept: 'peer_review', reject_final: '__rejected', reject_resubmittable: '__rejected_resubmittable' }, allow_permanent_reject: true },
      { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: 'producer_gate', needs_revision: 'peer_revision' }, revision_step: 'peer_revision', assignment_mode: 'auto', required_reviewer_count: 1 },
      { id: 'peer_revision', label: 'Peer Revision', type: 'revision', assignee_role: 'submitter', order: 2, transitions: {}, return_to: 'peer_review' },
      { id: 'producer_gate', label: 'Producer Review', type: 'approval', assignee_role: 'producer', order: 3, transitions: { approve: 'mastering', reject: 'producer_revision' }, allow_permanent_reject: false },
      { id: 'producer_revision', label: 'Producer Revision', type: 'revision', assignee_role: 'submitter', order: 4, transitions: {}, return_to: 'producer_gate' },
      { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', order: 5, transitions: { deliver: 'final_review', request_revision: 'mastering_revision' }, revision_step: 'mastering_revision', require_confirmation: true },
      { id: 'mastering_revision', label: 'Mastering Revision', type: 'revision', assignee_role: 'submitter', order: 6, transitions: {}, return_to: 'mastering' },
      { id: 'final_review', label: 'Final Review', type: 'approval', assignee_role: 'producer', order: 7, transitions: { approve: '__completed', reject: 'final_revision' }, allow_permanent_reject: true },
      { id: 'final_revision', label: 'Final Revision', type: 'revision', assignee_role: 'mastering_engineer', order: 8, transitions: {}, return_to: 'final_review' },
    ],
  }
  stages.value = parseConfigToStages(defaultConfig)
  markChanged()
}

// ── Stage operations ──

function addStage(type: EditorStage['type']) {
  const baseName = type === 'review' ? 'Review' : type === 'approval' ? 'Approval' : 'Delivery'
  const existingCount = stages.value.filter(s => s.type === type).length
  const suffix = existingCount > 0 ? ` ${existingCount + 1}` : ''
  const id = `custom_${type}_${Date.now().toString(36)}`

  const defaultRole = type === 'review' ? 'peer_reviewer' : type === 'delivery' ? 'mastering_engineer' : 'producer'

  stages.value.push({
    id,
    label: `${baseName}${suffix}`,
    type,
    assignee_role: defaultRole,
    assignment_mode: 'manual',
    reviewer_pool: [],
    required_reviewer_count: 1,
    allow_permanent_reject: false,
    require_confirmation: type === 'delivery',
    assignee_user_id: null,
    has_revision: type !== 'review',
    revision_label: `${baseName}${suffix} Revision`,
    revision_assignee_role: type === 'delivery' ? 'submitter' : 'submitter',
  })

  addingStage.value = false
  editingIndex.value = stages.value.length - 1
  markChanged()
}

function removeStage(index: number) {
  stages.value.splice(index, 1)
  if (editingIndex.value === index) editingIndex.value = null
  else if (editingIndex.value !== null && editingIndex.value > index) editingIndex.value--
  markChanged()
}

function moveStage(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= stages.value.length) return
  const temp = stages.value[index]
  stages.value[index] = stages.value[target]
  stages.value[target] = temp
  if (editingIndex.value === index) editingIndex.value = target
  else if (editingIndex.value === target) editingIndex.value = index
  markChanged()
}

function toggleEdit(index: number) {
  editingIndex.value = editingIndex.value === index ? null : index
}

// ── Build full config from editor state ──

const fullConfig = computed<WorkflowConfig>(() => {
  const steps: WorkflowStepDef[] = []
  let order = 0

  for (let i = 0; i < stages.value.length; i++) {
    const stage = stages.value[i]
    const nextMainStage = stages.value[i + 1]
    const forwardTarget = nextMainStage ? nextMainStage.id : '__completed'

    const transitions: Record<string, string> = {}
    const revisionId = `${stage.id}_revision`

    if (stage.type === 'review') {
      transitions.pass = forwardTarget
      if (stage.has_revision) {
        transitions.needs_revision = revisionId
      }
    } else if (stage.type === 'approval') {
      transitions.approve = forwardTarget
      if (stage.has_revision) {
        transitions.reject = revisionId
      }
      if (stage.allow_permanent_reject) {
        transitions.reject_final = '__rejected'
        transitions.reject_resubmittable = '__rejected_resubmittable'
      }
    } else if (stage.type === 'delivery') {
      transitions.deliver = forwardTarget
      if (stage.has_revision) {
        transitions.request_revision = revisionId
      }
    }

    const step: WorkflowStepDef = {
      id: stage.id,
      label: stage.label,
      type: stage.type,
      assignee_role: stage.assignee_role,
      order: order++,
      transitions,
    }

    // Add type-specific config
    if (stage.type === 'review') {
      step.assignment_mode = stage.assignment_mode
      if (stage.assignment_mode === 'auto' && stage.reviewer_pool.length > 0) {
        step.reviewer_pool = stage.reviewer_pool
      }
      step.required_reviewer_count = stage.required_reviewer_count
      if (stage.has_revision) step.revision_step = revisionId
    }
    if (stage.type === 'approval') {
      step.allow_permanent_reject = stage.allow_permanent_reject
      if (stage.assignee_user_id) step.assignee_user_id = stage.assignee_user_id
    }
    if (stage.type === 'delivery') {
      step.require_confirmation = stage.require_confirmation
      if (stage.assignee_user_id) step.assignee_user_id = stage.assignee_user_id
      if (stage.has_revision) step.revision_step = revisionId
    }

    steps.push(step)

    // Auto-create paired revision step
    if (stage.has_revision) {
      steps.push({
        id: revisionId,
        label: stage.revision_label,
        type: 'revision',
        assignee_role: stage.revision_assignee_role,
        order: order++,
        transitions: {},
        return_to: stage.id,
      })
    }
  }

  return { version: 2, steps }
})

// ── Validation ──

const validationErrors = computed<string[]>(() => {
  const errors: string[] = []
  if (stages.value.length === 0) {
    errors.push(t('workflowBuilder.validation.atLeastOneStep'))
    return errors
  }
  const ids = new Set<string>()
  for (const stage of stages.value) {
    if (!stage.label.trim()) errors.push(`Stage "${stage.id}" must have a label.`)
    if (ids.has(stage.id)) errors.push(`Duplicate stage ID: "${stage.id}".`)
    ids.add(stage.id)
  }
  // Must have path to __completed
  const hasCompleted = fullConfig.value.steps.some(
    s => Object.values(s.transitions).includes('__completed')
  )
  if (!hasCompleted) errors.push(t('workflowBuilder.validation.noCompletedPath'))
  return errors
})

const canSave = computed(() => validationErrors.value.length === 0 && hasChanges.value)

function handleSave() {
  if (!canSave.value) return
  emit('save', fullConfig.value)
}

// ── UI helpers ──

const typeColors: Record<string, string> = {
  review: 'bg-info-bg text-info',
  approval: 'bg-warning-bg text-warning',
  delivery: 'bg-success-bg text-success',
}

const typeLabels = computed(() => ({
  review: t('workflowBuilder.stepTypes.review'),
  approval: t('workflowBuilder.stepTypes.approval') || t('workflowBuilder.stepTypes.gate'),
  delivery: t('workflowBuilder.stepTypes.delivery'),
}))

const roleOptions = computed(() => [
  { value: 'producer', label: t('workflowBuilder.roles.producer') },
  { value: 'mastering_engineer', label: t('workflowBuilder.roles.mastering_engineer') },
  { value: 'peer_reviewer', label: t('workflowBuilder.roles.peer_reviewer') },
  { value: 'submitter', label: t('workflowBuilder.roles.submitter') },
])

function roleLabel(role: string): string {
  const opt = roleOptions.value.find(o => o.value === role)
  return opt?.label ?? role
}

const memberOptions = computed(() =>
  props.albumMembers.map(m => ({ value: m.user_id, label: m.user.display_name }))
)
</script>

<template>
  <div class="space-y-4">
    <!-- Stage list -->
    <div v-if="stages.length === 0" class="text-center py-8 space-y-4">
      <p class="text-sm text-muted-foreground">{{ t('workflowBuilder.emptyHint') }}</p>
      <button @click="loadDefaultWorkflow" class="btn-primary text-sm">
        {{ t('workflowBuilder.loadDefault') }}
      </button>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(stage, i) in stages"
        :key="stage.id"
        class="border border-border bg-card rounded-none"
      >
        <!-- Collapsed view -->
        <div class="flex items-center gap-2 px-4 py-3">
          <GripVertical class="w-4 h-4 text-muted-foreground shrink-0" />
          <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium shrink-0', typeColors[stage.type]]">
            {{ typeLabels[stage.type] }}
          </span>
          <span class="text-sm font-mono font-semibold text-foreground truncate">{{ stage.label }}</span>
          <span class="text-xs text-muted-foreground shrink-0 hidden sm:inline">{{ roleLabel(stage.assignee_role) }}</span>
          <span v-if="stage.has_revision" class="text-xs text-muted-foreground shrink-0 hidden md:inline">↩</span>
          <div class="ml-auto flex items-center gap-1 shrink-0">
            <button @click="moveStage(i, -1)" :disabled="i === 0" class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronUp class="w-4 h-4" />
            </button>
            <button @click="moveStage(i, 1)" :disabled="i === stages.length - 1" class="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronDown class="w-4 h-4" />
            </button>
            <button @click="toggleEdit(i)" class="p-1 text-muted-foreground hover:text-primary transition-colors">
              <Pencil v-if="editingIndex !== i" class="w-4 h-4" />
              <X v-else class="w-4 h-4" />
            </button>
            <button @click="removeStage(i)" class="p-1 text-muted-foreground hover:text-error transition-colors">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Expanded edit form -->
        <div v-if="editingIndex === i" class="border-t border-border px-4 py-4 space-y-4">
          <!-- Label -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowBuilder.stepLabelPlaceholder') }}</label>
            <input v-model="stage.label" @input="markChanged()" class="input-field w-full" />
          </div>

          <!-- Assignee role -->
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowBuilder.assigneeRoleLabel') }}</label>
            <select v-model="stage.assignee_role" @change="markChanged()" class="select-field w-full">
              <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <!-- Assignee user override (approval/delivery) -->
          <div v-if="stage.type === 'approval' || stage.type === 'delivery'">
            <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowEditor.assigneeOverride') }}</label>
            <select v-model="stage.assignee_user_id" @change="markChanged()" class="select-field w-full">
              <option :value="null">{{ t('workflowEditor.useRoleDefault') }}</option>
              <option v-for="opt in memberOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <!-- Review-specific: assignment mode -->
          <template v-if="stage.type === 'review'">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowEditor.assignmentMode') }}</label>
              <div class="flex gap-2">
                <button
                  @click="stage.assignment_mode = 'manual'; markChanged()"
                  :class="['px-3 py-1.5 rounded-full text-xs font-mono transition-colors', stage.assignment_mode === 'manual' ? 'bg-primary text-black' : 'bg-card border border-border text-foreground']"
                >{{ t('workflowEditor.manual') }}</button>
                <button
                  @click="stage.assignment_mode = 'auto'; markChanged()"
                  :class="['px-3 py-1.5 rounded-full text-xs font-mono transition-colors', stage.assignment_mode === 'auto' ? 'bg-primary text-black' : 'bg-card border border-border text-foreground']"
                >{{ t('workflowEditor.auto') }}</button>
              </div>
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowEditor.requiredReviewers') }}</label>
              <input v-model.number="stage.required_reviewer_count" @input="markChanged()" type="number" min="1" class="input-field w-24" />
            </div>
          </template>

          <!-- Approval-specific: permanent reject -->
          <div v-if="stage.type === 'approval'" class="flex items-center gap-2">
            <input
              type="checkbox"
              :id="`perm-reject-${i}`"
              v-model="stage.allow_permanent_reject"
              @change="markChanged()"
              class="accent-primary"
            />
            <label :for="`perm-reject-${i}`" class="text-xs text-muted-foreground">{{ t('workflowEditor.allowPermanentReject') }}</label>
          </div>

          <!-- Delivery-specific: require confirmation -->
          <div v-if="stage.type === 'delivery'" class="flex items-center gap-2">
            <input
              type="checkbox"
              :id="`confirm-${i}`"
              v-model="stage.require_confirmation"
              @change="markChanged()"
              class="accent-primary"
            />
            <label :for="`confirm-${i}`" class="text-xs text-muted-foreground">{{ t('workflowEditor.requireConfirmation') }}</label>
          </div>

          <!-- Revision pairing -->
          <div class="border-t border-border pt-3 space-y-3">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                :id="`revision-${i}`"
                v-model="stage.has_revision"
                @change="markChanged()"
                class="accent-primary"
              />
              <label :for="`revision-${i}`" class="text-xs text-muted-foreground">{{ t('workflowEditor.hasRevision') }}</label>
            </div>
            <template v-if="stage.has_revision">
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowEditor.revisionLabel') }}</label>
                <input v-model="stage.revision_label" @input="markChanged()" class="input-field w-full" />
              </div>
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">{{ t('workflowEditor.revisionAssignee') }}</label>
                <select v-model="stage.revision_assignee_role" @change="markChanged()" class="select-field w-full">
                  <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Add stage -->
    <div v-if="!addingStage" class="flex justify-center gap-2">
      <button @click="addingStage = true" class="btn-secondary flex items-center gap-1.5 text-sm">
        <Plus class="w-4 h-4" />
        {{ t('workflowBuilder.addStep') }}
      </button>
      <button @click="loadDefaultWorkflow" class="btn-secondary text-sm">
        {{ t('workflowBuilder.loadDefault') }}
      </button>
    </div>
    <div v-else class="border border-border border-dashed bg-card rounded-none p-4 space-y-3">
      <p class="text-xs text-muted-foreground">{{ t('workflowEditor.chooseType') }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="type in (['review', 'approval', 'delivery'] as const)"
          :key="type"
          @click="addStage(type)"
          :class="['px-4 py-2 rounded-full text-xs font-mono font-medium transition-colors border', typeColors[type], 'border-border hover:opacity-80']"
        >
          {{ typeLabels[type] }}
        </button>
      </div>
      <button @click="addingStage = false" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
        {{ t('common.cancel') }}
      </button>
    </div>

    <!-- Validation errors -->
    <div v-if="validationErrors.length > 0" class="text-xs text-error space-y-1">
      <p v-for="(err, i) in validationErrors" :key="i">{{ err }}</p>
    </div>

    <!-- Save -->
    <div class="flex items-center justify-between pt-2 border-t border-border">
      <span v-if="hasChanges" class="text-xs text-warning">{{ t('workflowEditor.unsavedChanges') }}</span>
      <span v-else class="text-xs text-muted-foreground">{{ t('workflowEditor.noChanges') }}</span>
      <button
        @click="handleSave"
        :disabled="!canSave || saving"
        class="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ saving ? t('common.loading') : t('workflowEditor.saveWorkflow') }}
      </button>
    </div>
  </div>
</template>
