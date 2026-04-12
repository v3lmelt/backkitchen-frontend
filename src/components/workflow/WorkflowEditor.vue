<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Check,
  ChevronDown,
  ChevronUp,
  GitBranch,
  MoveRight,
  PencilLine,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-vue-next'
import type { WorkflowConfig, WorkflowStepDef, WorkflowUiVariant } from '@/types'

interface MemberOption {
  value: number
  label: string
}

type StageKind = 'intake' | 'peer_review' | 'producer_gate' | 'mastering' | 'final_review'
type MainStepType = 'review' | 'approval' | 'delivery'

interface EditorStage {
  id: string
  kind: StageKind
  label: string
  allow_producer_direct: boolean
  assignee_user_id: number | null
  assignment_mode: 'manual' | 'auto'
  reviewer_pool: number[]
  required_reviewer_count: number
  allow_permanent_reject: boolean
  require_confirmation: boolean
  has_revision: boolean
  revision_id: string
  revision_label: string
  revision_assignee_role: string
  extra_reject_targets: string[]
}

interface StageMeta {
  type: MainStepType
  default_role: string
  ui_variant: Extract<WorkflowUiVariant, StageKind>
  default_label_key: string
  supports_revision: boolean
  supports_assignee_override: boolean
  supports_review_settings: boolean
  supports_permanent_reject: boolean
  supports_reject_targets: boolean
  supports_confirmation: boolean
  default_has_revision: boolean
  default_allow_permanent_reject: boolean
  default_require_confirmation: boolean
  default_revision_assignee_role: string
}

const STAGE_KINDS: StageKind[] = ['intake', 'peer_review', 'producer_gate', 'mastering', 'final_review']

const STAGE_META: Record<StageKind, StageMeta> = {
  intake: {
    type: 'approval',
    default_role: 'producer',
    ui_variant: 'intake',
    default_label_key: 'workflowEditor.stageKinds.intake.name',
    supports_revision: false,
    supports_assignee_override: false,
    supports_review_settings: false,
    supports_permanent_reject: true,
    supports_reject_targets: false,
    supports_confirmation: false,
    default_has_revision: false,
    default_allow_permanent_reject: true,
    default_require_confirmation: false,
    default_revision_assignee_role: 'submitter',
  },
  peer_review: {
    type: 'review',
    default_role: 'peer_reviewer',
    ui_variant: 'peer_review',
    default_label_key: 'workflowEditor.stageKinds.peer_review.name',
    supports_revision: true,
    supports_assignee_override: false,
    supports_review_settings: true,
    supports_permanent_reject: false,
    supports_reject_targets: false,
    supports_confirmation: false,
    default_has_revision: true,
    default_allow_permanent_reject: false,
    default_require_confirmation: false,
    default_revision_assignee_role: 'submitter',
  },
  producer_gate: {
    type: 'approval',
    default_role: 'producer',
    ui_variant: 'producer_gate',
    default_label_key: 'workflowEditor.stageKinds.producer_gate.name',
    supports_revision: true,
    supports_assignee_override: true,
    supports_review_settings: false,
    supports_permanent_reject: true,
    supports_reject_targets: true,
    supports_confirmation: false,
    default_has_revision: true,
    default_allow_permanent_reject: false,
    default_require_confirmation: false,
    default_revision_assignee_role: 'submitter',
  },
  mastering: {
    type: 'delivery',
    default_role: 'mastering_engineer',
    ui_variant: 'mastering',
    default_label_key: 'workflowEditor.stageKinds.mastering.name',
    supports_revision: true,
    supports_assignee_override: true,
    supports_review_settings: false,
    supports_permanent_reject: false,
    supports_reject_targets: true,
    supports_confirmation: true,
    default_has_revision: true,
    default_allow_permanent_reject: false,
    default_require_confirmation: true,
    default_revision_assignee_role: 'submitter',
  },
  final_review: {
    type: 'approval',
    default_role: 'producer',
    ui_variant: 'final_review',
    default_label_key: 'workflowEditor.stageKinds.final_review.name',
    supports_revision: true,
    supports_assignee_override: true,
    supports_review_settings: false,
    supports_permanent_reject: false,
    supports_reject_targets: true,
    supports_confirmation: false,
    default_has_revision: true,
    default_allow_permanent_reject: false,
    default_require_confirmation: false,
    default_revision_assignee_role: 'mastering_engineer',
  },
}

const props = withDefaults(defineProps<{
  workflowConfig: WorkflowConfig | null
  memberOptions?: MemberOption[]
  saving?: boolean
  saveable?: boolean
}>(), {
  memberOptions: () => [],
  saving: false,
  saveable: false,
})

const emit = defineEmits<{
  'update:workflowConfig': [config: WorkflowConfig | null]
  save: [config: WorkflowConfig]
}>()

const { t } = useI18n()

function stageLabel(kind: StageKind) {
  return t(STAGE_META[kind].default_label_key)
}

function revisionLabel(label: string) {
  return t('workflowEditor.defaultLabels.revision', { stage: label })
}

function inferStageKind(step: WorkflowStepDef, index: number): StageKind {
  if (step.ui_variant && STAGE_KINDS.includes(step.ui_variant as StageKind)) {
    return step.ui_variant as StageKind
  }

  if (step.id === 'intake' || step.id === 'submitted') return 'intake'
  if (step.id === 'peer_review') return 'peer_review'
  if (step.id === 'producer_gate' || step.id === 'producer_mastering_gate') return 'producer_gate'
  if (step.id === 'mastering') return 'mastering'
  if (step.id === 'final_review') return 'final_review'

  if (step.type === 'review') return 'peer_review'
  if (step.type === 'delivery') return 'mastering'
  if (step.transitions.accept || step.transitions.reject_resubmittable || step.transitions.reject_final) return 'intake'
  if (Object.values(step.transitions).includes('__completed')) return 'final_review'
  if (index === 0) return 'intake'
  return 'producer_gate'
}

function uniqueStageId(kind: StageKind, existingIds: string[]) {
  const base = kind
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

function createStage(kind: StageKind, existingIds: string[]): EditorStage {
  const label = stageLabel(kind)
  const meta = STAGE_META[kind]
  const id = uniqueStageId(kind, existingIds)

  return {
    id,
    kind,
    label,
    allow_producer_direct: false,
    assignee_user_id: null,
    assignment_mode: kind === 'peer_review' ? 'auto' : 'manual',
    reviewer_pool: [],
    required_reviewer_count: 1,
    allow_permanent_reject: meta.default_allow_permanent_reject,
    require_confirmation: meta.default_require_confirmation,
    has_revision: meta.default_has_revision,
    revision_id: `${id}_revision`,
    revision_label: revisionLabel(label),
    revision_assignee_role: meta.default_revision_assignee_role,
    extra_reject_targets: [],
  }
}

function parseConfigToStages(config: WorkflowConfig | null): EditorStage[] {
  if (!config) return []

  const revisionSteps = new Map<string, WorkflowStepDef>()
  const mainSteps: WorkflowStepDef[] = []

  for (const step of config.steps) {
    if (step.type === 'revision') revisionSteps.set(step.id, step)
    else mainSteps.push(step)
  }

  mainSteps.sort((a, b) => a.order - b.order)
  const mainStepIds = new Set(mainSteps.map(step => step.id))

  return mainSteps.map((step, index) => {
    const kind = inferStageKind(step, index)
    const meta = STAGE_META[kind]
    const revisionTarget = step.revision_step
      ? revisionSteps.get(step.revision_step) ?? null
      : Object.values(step.transitions)
        .map(target => revisionSteps.get(target) ?? null)
        .find(Boolean) ?? null

    return {
      id: step.id,
      kind,
      label: step.label,
      allow_producer_direct: Boolean(step.transitions.accept_producer_direct),
      assignee_user_id: step.assignee_user_id ?? null,
      assignment_mode: (step.assignment_mode ?? 'manual') as 'manual' | 'auto',
      reviewer_pool: step.reviewer_pool ?? [],
      required_reviewer_count: step.required_reviewer_count ?? 1,
      allow_permanent_reject: step.allow_permanent_reject ?? meta.default_allow_permanent_reject,
      require_confirmation: step.require_confirmation ?? meta.default_require_confirmation,
      has_revision: !!revisionTarget,
      revision_id: revisionTarget?.id ?? `${step.id}_revision`,
      revision_label: revisionTarget?.label ?? revisionLabel(step.label),
      revision_assignee_role: revisionTarget?.assignee_role ?? meta.default_revision_assignee_role,
      extra_reject_targets: Object.entries(step.transitions)
        .filter(([decision, target]) => decision.startsWith('reject_to_') && mainStepIds.has(target))
        .map(([, target]) => target),
    }
  })
}

function stageType(kind: StageKind): MainStepType {
  return STAGE_META[kind].type
}

const stages = ref<EditorStage[]>([])
const selectedStageId = ref<string | null>(null)
const addingStage = ref(false)
const hasChanges = ref(false)
const lastEmittedConfigSignature = ref<string | null>(null)
const inspectorRef = ref<HTMLElement | null>(null)

function configSignature(config: WorkflowConfig | null): string | null {
  return config ? JSON.stringify(config) : null
}

function syncFromConfig(config: WorkflowConfig | null) {
  stages.value = parseConfigToStages(config)
  selectedStageId.value = stages.value[0]?.id ?? null
  hasChanges.value = false
}

watch(
  () => props.workflowConfig,
  (config) => {
    const incomingSignature = configSignature(config)
    if (incomingSignature === lastEmittedConfigSignature.value) return
    syncFromConfig(config)
  },
  { immediate: true, deep: true },
)

const selectedStageIndex = computed(() =>
  stages.value.findIndex(stage => stage.id === selectedStageId.value),
)

const selectedStage = computed(() =>
  selectedStageIndex.value >= 0 ? stages.value[selectedStageIndex.value] : null,
)

const roleOptions = computed(() => [
  { value: 'producer', label: t('workflowBuilder.roles.producer') },
  { value: 'mastering_engineer', label: t('workflowBuilder.roles.mastering_engineer') },
  { value: 'peer_reviewer', label: t('workflowBuilder.roles.peer_reviewer') },
  { value: 'submitter', label: t('workflowBuilder.roles.submitter') },
])

const kindLabels = computed<Record<StageKind, string>>(() => ({
  intake: stageLabel('intake'),
  peer_review: stageLabel('peer_review'),
  producer_gate: stageLabel('producer_gate'),
  mastering: stageLabel('mastering'),
  final_review: stageLabel('final_review'),
}))

const typeBadgeClass: Record<MainStepType, string> = {
  review: 'bg-info-bg text-info',
  approval: 'bg-warning-bg text-warning',
  delivery: 'bg-success-bg text-success',
}

const memberOptions = computed(() => props.memberOptions)

const summary = computed(() => ({
  mainStageCount: stages.value.length,
  revisionCount: stages.value.filter(stage => stage.has_revision).length,
  autoReviewCount: stages.value.filter(stage => stage.kind === 'peer_review' && stage.assignment_mode === 'auto').length,
}))

const fullConfig = computed<WorkflowConfig>(() => {
  const steps: WorkflowStepDef[] = []
  let order = 0

  stages.value.forEach((stage, index) => {
    const meta = STAGE_META[stage.kind]
    const nextStage = stages.value[index + 1]
    const forwardTarget = nextStage ? nextStage.id : '__completed'
    const transitions: Record<string, string> = {}

    if (stage.kind === 'intake') {
      transitions.accept = forwardTarget
      const producerTarget = directProducerTarget(index)
      if (stage.allow_producer_direct && producerTarget) {
        transitions.accept_producer_direct = producerTarget.id
      }
      if (stage.allow_permanent_reject) {
        transitions.reject_final = '__rejected'
        transitions.reject_resubmittable = '__rejected_resubmittable'
      }
    }

    if (stage.kind === 'peer_review') {
      transitions.pass = forwardTarget
      if (stage.has_revision) transitions.needs_revision = stage.revision_id
    }

    if (stage.kind === 'producer_gate' || stage.kind === 'final_review') {
      if (stage.kind === 'producer_gate') {
        transitions.approve = forwardTarget
      }
      if (stage.has_revision) transitions.reject = stage.revision_id
      for (const targetStageId of stage.extra_reject_targets) {
        transitions[`reject_to_${targetStageId}`] = targetStageId
      }
      if (stage.allow_permanent_reject) {
        transitions.reject_final = '__rejected'
        transitions.reject_resubmittable = '__rejected_resubmittable'
      }
    }

    if (stage.kind === 'mastering') {
      transitions.deliver = forwardTarget
      if (stage.has_revision) transitions.request_revision = stage.revision_id
      for (const targetStageId of stage.extra_reject_targets) {
        transitions[`reject_to_${targetStageId}`] = targetStageId
      }
    }

    const step: WorkflowStepDef = {
      id: stage.id,
      label: stage.label,
      type: meta.type,
      ui_variant: meta.ui_variant,
      assignee_role: meta.default_role,
      order: order++,
      transitions,
    }

    if (meta.type === 'review') {
      step.assignment_mode = stage.assignment_mode
      step.required_reviewer_count = stage.required_reviewer_count
      if (stage.assignment_mode === 'auto' && stage.reviewer_pool.length > 0) {
        step.reviewer_pool = [...stage.reviewer_pool]
      }
      if (stage.has_revision) step.revision_step = stage.revision_id
    }

    if (meta.type === 'approval') {
      step.allow_permanent_reject = stage.allow_permanent_reject
      if (meta.supports_assignee_override && stage.assignee_user_id !== null) {
        step.assignee_user_id = stage.assignee_user_id
      }
    }

    if (meta.type === 'delivery') {
      step.require_confirmation = stage.require_confirmation
      if (meta.supports_assignee_override && stage.assignee_user_id !== null) {
        step.assignee_user_id = stage.assignee_user_id
      }
      if (stage.has_revision) step.revision_step = stage.revision_id
    }

    steps.push(step)

    if (stage.has_revision) {
      steps.push({
        id: stage.revision_id,
        label: stage.revision_label,
        type: 'revision',
        assignee_role: stage.revision_assignee_role,
        order: order++,
        transitions: {},
        return_to: stage.id,
      })
    }
  })

  return { version: 2, steps }
})

const validationErrors = computed<string[]>(() => {
  const errors: string[] = []

  if (stages.value.length === 0) {
    errors.push(t('workflowBuilder.validation.atLeastOneStep'))
    return errors
  }

  const seenIds = new Set<string>()
  const seenRevisionIds = new Set<string>()

  for (const [index, stage] of stages.value.entries()) {
    if (!stage.label.trim()) {
      errors.push(t('workflowBuilder.validation.stepLabelRequired', { id: stage.id }))
    }
    if (seenIds.has(stage.id)) {
      errors.push(t('workflowBuilder.validation.stepIdDuplicate', { id: stage.id }))
    }
    seenIds.add(stage.id)

    if (stage.has_revision) {
      if (!stage.revision_label.trim()) {
        errors.push(t('workflowBuilder.validation.stepLabelRequired', { id: stage.revision_id }))
      }
      if (seenIds.has(stage.revision_id) || seenRevisionIds.has(stage.revision_id)) {
        errors.push(t('workflowBuilder.validation.stepIdDuplicate', { id: stage.revision_id }))
      }
      seenRevisionIds.add(stage.revision_id)
    }

    if (stage.kind === 'peer_review' && stage.assignment_mode === 'auto') {
      if (stage.reviewer_pool.length === 0) {
        errors.push(t('workflowEditor.validation.reviewerPoolRequired', {
          label: stage.label || stage.id,
        }))
      } else if (stage.required_reviewer_count > stage.reviewer_pool.length) {
        errors.push(t('workflowEditor.validation.reviewerPoolTooSmall', {
          label: stage.label || stage.id,
        }))
      }
    }

    if (STAGE_META[stage.kind].supports_reject_targets) {
      const currentIndex = stageOrderMap.value.get(stage.id) ?? -1
      const hasInvalidTarget = stage.extra_reject_targets.some((targetId) => {
        const targetIndex = stageOrderMap.value.get(targetId)
        return targetIndex == null || targetIndex >= currentIndex
      })
      if (hasInvalidTarget) {
        errors.push(t('workflowEditor.validation.rejectTargetMustBeEarlier', {
          label: stage.label || stage.id,
        }))
      }
    }

    if (stage.kind === 'intake' && stage.allow_producer_direct && !directProducerTarget(index)) {
      errors.push(t('workflowEditor.validation.directProducerTargetMissing', {
        label: stage.label || stage.id,
      }))
    }
  }

  return errors
})

const isValid = computed(() => validationErrors.value.length === 0)

const previousStages = computed(() => {
  if (selectedStageIndex.value <= 0) return []
  return stages.value.slice(0, selectedStageIndex.value).map(stage => ({ id: stage.id, label: stage.label }))
})

const availableRejectTargets = computed(() => {
  const usedTargets = new Set(selectedStage.value?.extra_reject_targets ?? [])
  return previousStages.value.filter(option => !usedTargets.has(option.id))
})

const stageOrderMap = computed(() => {
  const order = new Map<string, number>()
  stages.value.forEach((stage, index) => order.set(stage.id, index))
  return order
})

function selectStage(stageId: string) {
  const alreadySelected = selectedStageId.value === stageId
  selectedStageId.value = stageId
  // On narrow screens the inspector stacks below the canvas, so auto-scroll to
  // it the first time the user selects a stage. The xl breakpoint (1280px)
  // matches the grid layout where the inspector sits in its own column.
  if (typeof window === 'undefined') return
  if (alreadySelected) return
  if (window.matchMedia('(min-width: 1280px)').matches) return
  nextTick(() => {
    inspectorRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function normalizeRejectTargetsForStage(stage: EditorStage, index: number) {
  if (!STAGE_META[stage.kind].supports_reject_targets || stage.extra_reject_targets.length === 0) {
    return
  }

  const filtered = stage.extra_reject_targets.filter((targetId) => {
    const targetIndex = stageOrderMap.value.get(targetId)
    return targetIndex != null && targetIndex < index
  })

  if (filtered.length !== stage.extra_reject_targets.length) {
    stage.extra_reject_targets = filtered
  }
}

function normalizeRejectTargetsAcrossWorkflow() {
  stages.value.forEach((stage, index) => normalizeRejectTargetsForStage(stage, index))
}

function roleLabel(role: string): string {
  return roleOptions.value.find(option => option.value === role)?.label ?? role
}

function stageKindLabel(kind: StageKind): string {
  return kindLabels.value[kind]
}

function memberLabel(userId: number | null): string | null {
  if (userId === null) return null
  return memberOptions.value.find(option => option.value === userId)?.label ?? `#${userId}`
}

function stageTypeClass(kind: StageKind): string {
  return typeBadgeClass[stageType(kind)]
}

function stageQuickTags(stage: EditorStage): string[] {
  const tags: string[] = []
  if (stage.kind === 'peer_review') {
    tags.push(stage.assignment_mode === 'auto' ? t('workflowEditor.auto') : t('workflowEditor.manual'))
    tags.push(t('workflowEditor.reviewerCountTag', { count: stage.required_reviewer_count }))
  }
  if (stage.assignee_user_id !== null) tags.push(t('workflowEditor.assigneePinned'))
  if (stage.require_confirmation) tags.push(t('workflowEditor.confirmationTag'))
  if (stage.allow_permanent_reject) tags.push(t('workflowEditor.permanentRejectTag'))
  if (stage.has_revision) tags.push(t('workflowEditor.revisionLoopTag'))
  return tags
}

function cardTitle(stage: EditorStage, index: number): string {
  return stage.label.trim() || t('workflowEditor.untitledStage', { index: index + 1 })
}

function primaryActionLabel(stage: EditorStage): string {
  if (stage.kind === 'intake') return t('trackDetail.actions.accept')
  if (stage.kind === 'peer_review') return t('workflowEditor.stageActions.pass')
  if (stage.kind === 'mastering') return t('workflowEditor.stageActions.deliver')
  return t('workflowEditor.stageActions.approve')
}

function revisionActionLabel(stage: EditorStage): string {
  if (stage.kind === 'peer_review') return t('workflowEditor.stageActions.needsRevision')
  if (stage.kind === 'mastering') return t('workflowEditor.stageActions.requestRevision')
  return t('workflowEditor.stageActions.reject')
}

function primaryTargetLabel(index: number): string {
  return stages.value[index + 1]?.label || t('workflowEditor.terminal.completed')
}

function directProducerTarget(stageIndex: number): EditorStage | null {
  return stages.value.slice(stageIndex + 1).find(stage => stage.kind === 'producer_gate') ?? null
}

function directProducerTargetLabel(stageIndex: number): string {
  return directProducerTarget(stageIndex)?.label ?? t('workflowEditor.directProducerUnavailable')
}

function markChanged() {
  normalizeRejectTargetsAcrossWorkflow()
  hasChanges.value = true
  if (!props.saveable) {
    const nextConfig = isValid.value ? fullConfig.value : null
    lastEmittedConfigSignature.value = configSignature(nextConfig)
    emit('update:workflowConfig', nextConfig)
  }
}

function loadDefaultWorkflow() {
  const created: EditorStage[] = []
  for (const kind of STAGE_KINDS) {
    created.push(createStage(kind, created.map(item => item.id)))
  }
  if (created[0]?.kind === 'intake') {
    created[0].allow_producer_direct = true
  }
  stages.value = created
  selectedStageId.value = stages.value[0]?.id ?? null
  markChanged()
}

watch(
  () => stages.value.map(stage => stage.id),
  () => {
    normalizeRejectTargetsAcrossWorkflow()
  },
  { deep: true },
)

watch(
  () => selectedStageIndex.value,
  () => {
    const stage = selectedStage.value
    if (!stage) return
    normalizeRejectTargetsForStage(stage, selectedStageIndex.value)
  },
)

function addStage(kind: StageKind) {
  const stage = createStage(kind, stages.value.map(item => item.id))
  stages.value.push(stage)
  selectedStageId.value = stage.id
  addingStage.value = false
  markChanged()
}

function removeStage(stageId: string) {
  const index = stages.value.findIndex(stage => stage.id === stageId)
  if (index < 0) return
  stages.value.splice(index, 1)
  for (const stage of stages.value) {
    stage.extra_reject_targets = stage.extra_reject_targets.filter(targetId => targetId !== stageId)
  }
  // Clear allow_producer_direct on any intake stage that no longer has a downstream producer_gate
  for (let i = 0; i < stages.value.length; i++) {
    const stage = stages.value[i]
    if (stage.kind === 'intake' && stage.allow_producer_direct && !directProducerTarget(i)) {
      stage.allow_producer_direct = false
    }
  }
  selectedStageId.value = stages.value[Math.min(index, stages.value.length - 1)]?.id ?? null
  markChanged()
}

function moveSelectedStage(direction: -1 | 1) {
  const index = selectedStageIndex.value
  const target = index + direction
  if (index < 0 || target < 0 || target >= stages.value.length) return
  const current = stages.value[index]
  stages.value[index] = stages.value[target]
  stages.value[target] = current
  selectedStageId.value = current.id
  markChanged()
}

function toggleReviewer(userId: number) {
  const stage = selectedStage.value
  if (!stage) return
  if (stage.reviewer_pool.includes(userId)) {
    stage.reviewer_pool = stage.reviewer_pool.filter(id => id !== userId)
  } else {
    stage.reviewer_pool = [...stage.reviewer_pool, userId]
  }
  markChanged()
}

function addRejectTarget() {
  const stage = selectedStage.value
  if (!stage) return
  const firstAvailable = availableRejectTargets.value[0]
  if (!firstAvailable) return
  stage.extra_reject_targets = [...stage.extra_reject_targets, firstAvailable.id]
  markChanged()
}

function removeRejectTarget(targetStageId: string) {
  const stage = selectedStage.value
  if (!stage) return
  stage.extra_reject_targets = stage.extra_reject_targets.filter(id => id !== targetStageId)
  markChanged()
}

function handleRejectTargetChange(index: number, event: Event) {
  const stage = selectedStage.value
  const target = event.target as HTMLSelectElement | null
  if (!stage || !target) return
  const targetOrder = stageOrderMap.value.get(target.value)
  if (targetOrder == null || targetOrder >= selectedStageIndex.value) {
    markChanged()
    return
  }
  stage.extra_reject_targets[index] = target.value
  stage.extra_reject_targets = [...stage.extra_reject_targets]
  markChanged()
}

function updateSelectedKind(kind: StageKind) {
  const stage = selectedStage.value
  if (!stage || stage.kind === kind) return
  const meta = STAGE_META[kind]
  stage.kind = kind
  stage.label = stageKindLabel(kind)
  stage.allow_producer_direct = kind === 'intake' ? stage.allow_producer_direct : false
  stage.assignee_user_id = meta.supports_assignee_override ? stage.assignee_user_id : null
  stage.assignment_mode = kind === 'peer_review' ? 'auto' : 'manual'
  stage.reviewer_pool = []
  stage.required_reviewer_count = 1
  stage.allow_permanent_reject = meta.default_allow_permanent_reject
  stage.require_confirmation = meta.default_require_confirmation
  stage.has_revision = meta.default_has_revision
  stage.revision_label = revisionLabel(stage.label)
  stage.revision_assignee_role = meta.default_revision_assignee_role
  stage.extra_reject_targets = []
  markChanged()
}

function saveConfig() {
  if (!props.saveable || !isValid.value || !hasChanges.value) return
  emit('save', fullConfig.value)
}
</script>

<template>
  <div class="space-y-5">
    <div class="border border-border bg-card rounded-none p-4 sm:p-5 space-y-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-foreground">
            <PencilLine class="w-4 h-4 text-primary" />
            <h3 class="text-sm font-mono font-semibold">{{ t('workflowEditor.visualTitle') }}</h3>
          </div>
          <p class="text-sm text-muted-foreground max-w-2xl">{{ t('workflowEditor.visualDesc') }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button @click="loadDefaultWorkflow" class="btn-secondary text-xs">
            {{ t('workflowBuilder.loadDefault') }}
          </button>
          <button @click="addingStage = !addingStage" class="btn-primary text-xs">
            <Plus class="w-3.5 h-3.5 mr-1 inline" />{{ t('workflowBuilder.addStep') }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="border border-border bg-background rounded-none px-3 py-3">
          <div class="text-xs text-muted-foreground">{{ t('workflowEditor.summary.mainStages') }}</div>
          <div class="text-lg font-mono font-semibold text-foreground mt-1">{{ summary.mainStageCount }}</div>
        </div>
        <div class="border border-border bg-background rounded-none px-3 py-3">
          <div class="text-xs text-muted-foreground">{{ t('workflowEditor.summary.revisionLoops') }}</div>
          <div class="text-lg font-mono font-semibold text-foreground mt-1">{{ summary.revisionCount }}</div>
        </div>
        <div class="border border-border bg-background rounded-none px-3 py-3">
          <div class="text-xs text-muted-foreground">{{ t('workflowEditor.summary.autoReviewStages') }}</div>
          <div class="text-lg font-mono font-semibold text-foreground mt-1">{{ summary.autoReviewCount }}</div>
        </div>
      </div>

      <div v-if="addingStage" class="border border-dashed border-border bg-background rounded-none p-4">
        <p class="text-xs text-muted-foreground mb-3">{{ t('workflowEditor.chooseType') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="kind in STAGE_KINDS"
            :key="kind"
            @click="addStage(kind)"
            :class="['px-4 h-10 rounded-full border border-border font-mono text-sm transition-colors', stageTypeClass(kind), 'hover:opacity-90']"
          >
            {{ stageKindLabel(kind) }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="stages.length === 0" class="border border-border bg-card rounded-none p-8 text-center space-y-4">
      <p class="text-sm text-muted-foreground">{{ t('workflowBuilder.emptyHint') }}</p>
      <div class="flex items-center justify-center gap-2 flex-wrap">
        <button @click="loadDefaultWorkflow" class="btn-primary text-sm">{{ t('workflowBuilder.loadDefault') }}</button>
        <button @click="addingStage = true" class="btn-secondary text-sm">{{ t('workflowBuilder.addStep') }}</button>
      </div>
    </div>

    <div v-else class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] gap-5 items-start">
      <div class="border border-border bg-card rounded-none p-4 sm:p-5">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowEditor.canvasTitle') }}</h4>
            <p class="text-xs text-muted-foreground mt-1">{{ t('workflowEditor.canvasDesc') }}</p>
          </div>
        </div>

        <div class="space-y-2">
          <div v-for="(stage, index) in stages" :key="stage.id" class="space-y-1.5">
            <div
              role="button"
              tabindex="0"
              @click="selectStage(stage.id)"
              @keydown.enter.prevent="selectStage(stage.id)"
              @keydown.space.prevent="selectStage(stage.id)"
              :class="[
                'group w-full text-left border rounded-none transition-all cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                selectedStageId === stage.id
                  ? 'border-primary bg-background shadow-[inset_3px_0_0_#FF8400]'
                  : 'border-border bg-card hover:bg-background/80',
              ]"
            >
              <div class="px-3 py-3 sm:px-5 space-y-2.5">
                <div class="flex items-start gap-2 sm:gap-3">
                  <div class="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-xs font-mono text-foreground shrink-0">
                    {{ index + 1 }}
                  </div>

                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono', stageTypeClass(stage.kind)]">
                        {{ stageKindLabel(stage.kind) }}
                      </span>
                      <span class="text-sm font-mono font-semibold text-foreground break-words min-w-0">{{ cardTitle(stage, index) }}</span>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span class="inline-flex items-center gap-1">
                        <UserRound class="w-3.5 h-3.5" />
                        {{ memberLabel(stage.assignee_user_id) ?? roleLabel(STAGE_META[stage.kind].default_role) }}
                      </span>
                      <span v-for="tag in stageQuickTags(stage)" :key="tag" class="px-2 py-0.5 rounded-full bg-border text-foreground font-mono">
                        {{ tag }}
                      </span>
                    </div>
                  </div>

                  <div class="shrink-0 flex items-center gap-0.5 -mr-1 -mt-1">
                    <button
                      type="button"
                      @click.stop="selectedStageId = stage.id; moveSelectedStage(-1)"
                      :disabled="index === 0"
                      :title="t('common.moveUp')"
                      :aria-label="t('common.moveUp')"
                      class="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronUp class="w-4 h-4" :stroke-width="2" />
                    </button>
                    <button
                      type="button"
                      @click.stop="selectedStageId = stage.id; moveSelectedStage(1)"
                      :disabled="index === stages.length - 1"
                      :title="t('common.moveDown')"
                      :aria-label="t('common.moveDown')"
                      class="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown class="w-4 h-4" :stroke-width="2" />
                    </button>
                    <button
                      type="button"
                      @click.stop="removeStage(stage.id)"
                      :title="t('common.delete')"
                      :aria-label="t('common.delete')"
                      class="p-2 text-muted-foreground hover:text-error transition-colors"
                    >
                      <Trash2 class="w-4 h-4" :stroke-width="2" />
                    </button>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 text-xs">
                  <span class="inline-flex items-center gap-1.5 border border-border bg-background rounded-none px-2.5 py-1.5 text-muted-foreground">
                    <span class="font-mono text-foreground">{{ primaryActionLabel(stage) }}</span>
                    <MoveRight class="w-3 h-3" />
                    <span class="font-mono text-foreground">{{ primaryTargetLabel(index) }}</span>
                  </span>
                  <span
                    v-if="stage.kind === 'intake' && stage.allow_producer_direct && directProducerTarget(index)"
                    class="inline-flex items-center gap-1.5 border border-border bg-background rounded-none px-2.5 py-1.5 text-muted-foreground"
                  >
                    <span class="font-mono text-foreground">{{ t('trackDetail.actions.accept_producer_direct') }}</span>
                    <MoveRight class="w-3 h-3" />
                    <span class="font-mono text-foreground">{{ directProducerTargetLabel(index) }}</span>
                  </span>
                  <span
                    v-if="stage.has_revision"
                    class="inline-flex items-center gap-1.5 border border-border bg-background rounded-none px-2.5 py-1.5 text-muted-foreground"
                  >
                    <span class="font-mono text-foreground">{{ revisionActionLabel(stage) }}</span>
                    <MoveRight class="w-3 h-3" />
                    <span class="font-mono text-foreground">{{ stage.revision_label }}</span>
                  </span>
                </div>
              </div>
            </div>

            <div v-if="index < stages.length - 1" class="flex items-center justify-center gap-1.5 py-0.5 text-[11px] text-muted-foreground">
              <ChevronDown class="w-3.5 h-3.5 shrink-0 opacity-60" :stroke-width="2" />
              <span class="font-mono opacity-70 truncate">{{ stages[index + 1].label }}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 border border-dashed border-success/30 bg-success-bg rounded-none px-4 py-3 flex items-center gap-2 text-sm text-success">
          <Check class="w-4 h-4" />
          <span class="font-mono">{{ t('workflowEditor.terminal.completed') }}</span>
        </div>
      </div>

      <div ref="inspectorRef" class="border border-border bg-card rounded-none p-4 sm:p-5 space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto overscroll-contain scroll-mt-6">
        <div v-if="selectedStage" class="space-y-4 pb-1">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono', stageTypeClass(selectedStage.kind)]">
                  {{ stageKindLabel(selectedStage.kind) }}
                </span>
                <h4 class="text-sm font-mono font-semibold text-foreground">{{ cardTitle(selectedStage, selectedStageIndex) }}</h4>
              </div>
              <p class="text-xs text-muted-foreground mt-1">{{ t('workflowEditor.inspectorDesc') }}</p>
            </div>
          </div>

          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowEditor.chooseType') }}</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                v-for="kind in STAGE_KINDS"
                :key="kind"
                @click="updateSelectedKind(kind)"
                :class="[
                  'h-10 rounded-full border font-mono text-xs transition-colors',
                  selectedStage.kind === kind
                    ? 'border-primary bg-primary text-black'
                    : 'border-border bg-background text-foreground',
                ]"
              >
                {{ stageKindLabel(kind) }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowBuilder.stepLabelPlaceholder') }}</label>
            <input v-model="selectedStage.label" @input="markChanged()" class="input-field w-full" />
          </div>

          <div class="border border-border bg-background rounded-none p-4 space-y-2">
            <label class="block text-xs text-muted-foreground">{{ t('workflowBuilder.assigneeRoleLabel') }}</label>
            <div class="text-sm text-foreground font-mono">
              {{ roleLabel(STAGE_META[selectedStage.kind].default_role) }}
            </div>
          </div>

          <div v-if="STAGE_META[selectedStage.kind].supports_assignee_override">
            <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowEditor.assigneeOverride') }}</label>
            <select v-model="selectedStage.assignee_user_id" @change="markChanged()" class="select-field w-full">
              <option :value="null">{{ t('workflowEditor.useRoleDefault') }}</option>
              <option v-for="option in memberOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>

          <div v-if="selectedStage.kind === 'peer_review'" class="space-y-4 border border-border bg-background rounded-none p-4">
            <div>
              <label class="block text-xs text-muted-foreground mb-2">{{ t('workflowEditor.assignmentMode') }}</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  @click="selectedStage.assignment_mode = 'manual'; markChanged()"
                  :class="[
                    'h-10 rounded-full border font-mono text-xs transition-colors',
                    selectedStage.assignment_mode === 'manual'
                      ? 'border-primary bg-primary text-black'
                      : 'border-border bg-card text-foreground',
                  ]"
                >
                  {{ t('workflowEditor.manual') }}
                </button>
                <button
                  @click="selectedStage.assignment_mode = 'auto'; markChanged()"
                  :class="[
                    'h-10 rounded-full border font-mono text-xs transition-colors',
                    selectedStage.assignment_mode === 'auto'
                      ? 'border-primary bg-primary text-black'
                      : 'border-border bg-card text-foreground',
                  ]"
                >
                  {{ t('workflowEditor.auto') }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowEditor.requiredReviewers') }}</label>
              <input
                v-model.number="selectedStage.required_reviewer_count"
                @input="markChanged()"
                type="number"
                min="1"
                class="input-field w-28"
              />
            </div>

            <div v-if="selectedStage.assignment_mode === 'auto'" class="space-y-2">
              <div class="flex items-center justify-between gap-3">
                <label class="block text-xs text-muted-foreground">{{ t('workflowEditor.reviewerPool') }}</label>
                <span class="text-xs text-muted-foreground">{{ t('workflowEditor.poolSelected', { count: selectedStage.reviewer_pool.length }) }}</span>
              </div>
              <div v-if="memberOptions.length" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  v-for="option in memberOptions"
                  :key="option.value"
                  class="flex items-center gap-2 border border-border bg-card rounded-none px-3 py-2 text-sm text-foreground cursor-pointer"
                >
                  <input
                    type="checkbox"
                    class="checkbox"
                    :checked="selectedStage.reviewer_pool.includes(option.value)"
                    @change="toggleReviewer(option.value)"
                  />
                  <span class="truncate">{{ option.label }}</span>
                </label>
              </div>
              <p v-else class="text-xs text-muted-foreground">{{ t('workflowEditor.noMembersHint') }}</p>
            </div>
          </div>

          <div v-if="STAGE_META[selectedStage.kind].supports_permanent_reject" class="border border-border bg-background rounded-none p-4">
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                v-model="selectedStage.allow_permanent_reject"
                @change="markChanged()"
                type="checkbox"
                class="checkbox"
              />
              <span>{{ t('workflowEditor.allowPermanentReject') }}</span>
            </label>
          </div>

          <div v-if="selectedStage.kind === 'intake'" class="border border-border bg-background rounded-none p-4 space-y-3">
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                v-model="selectedStage.allow_producer_direct"
                @change="markChanged()"
                type="checkbox"
                class="checkbox"
                :disabled="!directProducerTarget(selectedStageIndex)"
              />
              <span>{{ t('workflowEditor.allowProducerDirect') }}</span>
            </label>
            <p class="text-xs text-muted-foreground">
              {{ t('workflowEditor.directProducerHint', { stage: directProducerTargetLabel(selectedStageIndex) }) }}
            </p>
          </div>

          <div v-if="STAGE_META[selectedStage.kind].supports_reject_targets" class="space-y-4 border border-border bg-background rounded-none p-4">
            <div class="flex items-center justify-between gap-2">
              <label class="block text-xs text-muted-foreground">{{ t('workflowEditor.extraRejectTargets') }}</label>
              <button
                @click="addRejectTarget"
                :disabled="availableRejectTargets.length === 0"
                class="text-xs text-primary hover:text-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {{ t('workflowEditor.addRejectTarget') }}
              </button>
            </div>

            <div v-if="selectedStage.extra_reject_targets.length" class="space-y-2">
              <div v-for="(targetStageId, index) in selectedStage.extra_reject_targets" :key="`${selectedStage.id}-${index}`" class="flex items-center gap-2">
                <select
                  :value="targetStageId"
                  @change="handleRejectTargetChange(index, $event)"
                  class="select-field-sm flex-1"
                >
                  <option v-for="option in previousStages" :key="option.id" :value="option.id">{{ option.label }}</option>
                </select>
                <button @click="removeRejectTarget(targetStageId)" class="text-muted-foreground hover:text-error transition-colors">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>

            <p v-else class="text-xs text-muted-foreground">{{ t('workflowEditor.noRejectTargets') }}</p>
          </div>

          <div v-if="STAGE_META[selectedStage.kind].supports_confirmation" class="border border-border bg-background rounded-none p-4">
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                v-model="selectedStage.require_confirmation"
                @change="markChanged()"
                type="checkbox"
                class="checkbox"
              />
              <span>{{ t('workflowEditor.requireConfirmation') }}</span>
            </label>
          </div>

          <div v-if="STAGE_META[selectedStage.kind].supports_revision" class="space-y-4 border border-border bg-background rounded-none p-4">
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                v-model="selectedStage.has_revision"
                @change="markChanged()"
                type="checkbox"
                class="checkbox"
              />
              <span>{{ t('workflowEditor.hasRevision') }}</span>
            </label>

            <template v-if="selectedStage.has_revision">
              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowEditor.revisionLabel') }}</label>
                <input v-model="selectedStage.revision_label" @input="markChanged()" class="input-field w-full" />
              </div>

              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowEditor.revisionAssignee') }}</label>
                <select v-model="selectedStage.revision_assignee_role" @change="markChanged()" class="select-field w-full">
                  <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>

              <div class="border border-border bg-card rounded-none px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                <GitBranch class="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span>
                  {{ revisionActionLabel(selectedStage) }}
                  <span class="mx-1">-></span>
                  <span class="text-foreground font-mono">{{ selectedStage.revision_label }}</span>
                  <MoveRight class="w-3 h-3 inline mx-1" />
                  <span>{{ t('workflowEditor.returnToCurrent') }}</span>
                </span>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="text-sm text-muted-foreground">{{ t('workflowEditor.selectStageHint') }}</div>
      </div>
    </div>

    <div v-if="validationErrors.length" class="border border-error bg-error-bg rounded-none px-4 py-3 space-y-1">
      <p v-for="error in validationErrors" :key="error" class="text-xs text-error">{{ error }}</p>
    </div>

    <div v-if="props.saveable" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4">
      <div class="text-xs" :class="hasChanges ? 'text-warning' : 'text-muted-foreground'">
        {{ hasChanges ? t('workflowEditor.unsavedChanges') : t('workflowEditor.noChanges') }}
      </div>
      <button
        @click="saveConfig"
        :disabled="!isValid || !hasChanges || props.saving"
        class="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {{ props.saving ? t('common.loading') : t('workflowEditor.saveWorkflow') }}
      </button>
    </div>
  </div>
</template>
