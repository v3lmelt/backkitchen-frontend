<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WorkflowStepType, WorkflowConfig } from '@/types'
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps<{
  modelValue: WorkflowConfig | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WorkflowConfig | null]
}>()

const STEP_TYPE_VALUES: WorkflowStepType[] = ['gate', 'review', 'revision', 'delivery']
const ROLE_VALUES = ['producer', 'mastering_engineer', 'peer_reviewer', 'submitter'] as const

interface EditableStep {
  id: string
  label: string
  type: WorkflowStepType
  assignee_role: string
  transitions: { decision: string; target: string }[]
  return_to: string
  revision_step: string
}

const steps = ref<EditableStep[]>([])
const errors = ref<string[]>([])
let syncing = false

// Sync from prop (suppress emission during sync to avoid infinite loop)
watch(
  () => props.modelValue,
  (config) => {
    if (config) {
      syncing = true
      steps.value = config.steps.map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        assignee_role: s.assignee_role,
        transitions: Object.entries(s.transitions).map(([decision, target]) => ({ decision, target })),
        return_to: s.return_to ?? '',
        revision_step: s.revision_step ?? '',
      }))
      nextTick(() => { syncing = false })
    }
  },
  { immediate: true },
)

// Emit changes (skip when syncing from parent)
watch(steps, () => { if (!syncing) emitConfig() }, { deep: true })

const stepIds = computed(() => steps.value.map((s) => s.id))

const targetOptions = computed(() => {
  const opts = steps.value.map((s) => ({ value: s.id, label: s.label || s.id }))
  opts.push({ value: '__completed', label: t('workflowBuilder.targets.completed') })
  opts.push({ value: '__rejected', label: t('workflowBuilder.targets.rejected') })
  opts.push({ value: '__rejected_resubmittable', label: t('workflowBuilder.targets.rejectedResubmittable') })
  return opts
})

function addStep() {
  const idx = steps.value.length
  const id = `step_${idx + 1}`
  steps.value.push({
    id,
    label: '',
    type: 'gate',
    assignee_role: 'producer',
    transitions: [],
    return_to: '',
    revision_step: '',
  })
}

function removeStep(index: number) {
  steps.value.splice(index, 1)
}

function moveStep(index: number, direction: -1 | 1) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= steps.value.length) return
  const temp = steps.value[index]
  steps.value[index] = steps.value[newIndex]
  steps.value[newIndex] = temp
}

function addTransition(stepIndex: number) {
  steps.value[stepIndex].transitions.push({ decision: '', target: '' })
}

function removeTransition(stepIndex: number, trIndex: number) {
  steps.value[stepIndex].transitions.splice(trIndex, 1)
}

function loadDefaultWorkflow() {
  steps.value = [
    { id: 'submitted', label: 'Submitted', type: 'gate', assignee_role: 'producer', transitions: [
      { decision: 'accept', target: 'peer_review' },
      { decision: 'reject_final', target: '__rejected' },
      { decision: 'reject_resubmittable', target: '__rejected_resubmittable' },
    ], return_to: '', revision_step: '' },
    { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', transitions: [
      { decision: 'pass', target: 'producer_mastering_gate' },
      { decision: 'needs_revision', target: 'peer_revision' },
    ], return_to: '', revision_step: 'peer_revision' },
    { id: 'peer_revision', label: 'Peer Revision', type: 'revision', assignee_role: 'submitter', transitions: [], return_to: 'peer_review', revision_step: '' },
    { id: 'producer_mastering_gate', label: 'Producer Gate', type: 'gate', assignee_role: 'producer', transitions: [
      { decision: 'send_to_mastering', target: 'mastering' },
      { decision: 'request_peer_revision', target: 'peer_revision' },
    ], return_to: '', revision_step: '' },
    { id: 'mastering', label: 'Mastering', type: 'delivery', assignee_role: 'mastering_engineer', transitions: [
      { decision: 'deliver', target: 'final_review' },
      { decision: 'request_revision', target: 'mastering_revision' },
    ], return_to: '', revision_step: 'mastering_revision' },
    { id: 'mastering_revision', label: 'Mastering Revision', type: 'revision', assignee_role: 'submitter', transitions: [], return_to: 'mastering', revision_step: '' },
    { id: 'final_review', label: 'Final Review', type: 'review', assignee_role: 'producer', transitions: [
      { decision: 'approve', target: '__completed' },
      { decision: 'return', target: 'mastering' },
    ], return_to: '', revision_step: '' },
  ]
}

function validate(): string[] {
  const errs: string[] = []
  const ids = new Set<string>()

  if (steps.value.length === 0) {
    errs.push(t('workflowBuilder.validation.atLeastOneStep'))
    return errs
  }

  for (const step of steps.value) {
    if (!step.id) errs.push(t('workflowBuilder.validation.stepIdRequired'))
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(step.id)) errs.push(t('workflowBuilder.validation.stepIdInvalid', { id: step.id }))
    if (ids.has(step.id)) errs.push(t('workflowBuilder.validation.stepIdDuplicate', { id: step.id }))
    ids.add(step.id)
    if (!step.label) errs.push(t('workflowBuilder.validation.stepLabelRequired', { id: step.id }))

    for (const tr of step.transitions) {
      if (!tr.decision) errs.push(t('workflowBuilder.validation.transitionDecisionRequired', { id: step.id }))
      if (!tr.target) errs.push(t('workflowBuilder.validation.transitionTargetRequired', { id: step.id, decision: tr.decision }))
    }

    if (step.type === 'revision' && !step.return_to) {
      errs.push(t('workflowBuilder.validation.revisionReturnToRequired', { id: step.id }))
    }
  }

  const hasCompleted = steps.value.some((s) =>
    s.transitions.some((tr) => tr.target === '__completed'),
  )
  if (!hasCompleted) errs.push(t('workflowBuilder.validation.noCompletedPath'))

  return errs
}

function emitConfig() {
  errors.value = validate()
  if (errors.value.length > 0) {
    emit('update:modelValue', null)
    return
  }

  const config: WorkflowConfig = {
    version: 1,
    steps: steps.value.map((s, i) => {
      const transitions: Record<string, string> = {}
      for (const tr of s.transitions) {
        if (tr.decision && tr.target) transitions[tr.decision] = tr.target
      }
      return {
        id: s.id,
        label: s.label,
        type: s.type,
        assignee_role: s.assignee_role,
        order: i,
        transitions,
        return_to: s.type === 'revision' && s.return_to ? s.return_to : null,
        revision_step: (s.type === 'review' || s.type === 'delivery') && s.revision_step ? s.revision_step : null,
      }
    }),
  }
  emit('update:modelValue', config)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <button @click="addStep" class="btn-secondary text-xs">
        <Plus class="w-3.5 h-3.5 mr-1" /> {{ t('workflowBuilder.addStep') }}
      </button>
      <button @click="loadDefaultWorkflow" class="btn-secondary text-xs">
        {{ t('workflowBuilder.loadDefault') }}
      </button>
    </div>

    <!-- Step list -->
    <div v-if="steps.length === 0" class="text-sm text-muted-foreground py-4">
      {{ t('workflowBuilder.emptyHint') }}
    </div>

    <div v-for="(step, idx) in steps" :key="idx" class="border border-border rounded-none p-3 sm:p-4 space-y-3 bg-card">
      <!-- Step header -->
      <div class="flex flex-wrap items-center gap-2">
        <GripVertical class="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span class="text-xs font-mono text-muted-foreground w-6">{{ idx + 1 }}</span>
        <div class="flex items-center gap-1 ml-auto sm:hidden">
          <button @click="moveStep(idx, -1)" :disabled="idx === 0" class="p-1 hover:text-foreground text-muted-foreground disabled:opacity-30">
            <ChevronUp class="w-4 h-4" />
          </button>
          <button @click="moveStep(idx, 1)" :disabled="idx === steps.length - 1" class="p-1 hover:text-foreground text-muted-foreground disabled:opacity-30">
            <ChevronDown class="w-4 h-4" />
          </button>
          <button @click="removeStep(idx)" class="p-1 hover:text-error text-muted-foreground">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
        <input
          v-model="step.id"
          class="input-field text-xs font-mono !h-8 w-full sm:w-32 order-1 sm:order-none"
          placeholder="step_id"
        />
        <input
          v-model="step.label"
          class="input-field text-xs !h-8 w-full sm:flex-1 order-2 sm:order-none"
          :placeholder="t('workflowBuilder.stepLabelPlaceholder')"
        />
        <div class="hidden sm:flex gap-1 order-3">
          <button @click="moveStep(idx, -1)" :disabled="idx === 0" class="p-1 hover:text-foreground text-muted-foreground disabled:opacity-30">
            <ChevronUp class="w-4 h-4" />
          </button>
          <button @click="moveStep(idx, 1)" :disabled="idx === steps.length - 1" class="p-1 hover:text-foreground text-muted-foreground disabled:opacity-30">
            <ChevronDown class="w-4 h-4" />
          </button>
          <button @click="removeStep(idx)" class="p-1 hover:text-error text-muted-foreground">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Step config -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowBuilder.typeLabel') }}</label>
          <select v-model="step.type" class="select-field-sm w-full">
            <option v-for="st in STEP_TYPE_VALUES" :key="st" :value="st">{{ t(`workflowBuilder.stepTypes.${st}`) }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowBuilder.assigneeRoleLabel') }}</label>
          <select v-model="step.assignee_role" class="select-field-sm w-full">
            <option v-for="r in ROLE_VALUES" :key="r" :value="r">{{ t(`workflowBuilder.roles.${r}`) }}</option>
          </select>
        </div>
      </div>

      <!-- Revision: return_to -->
      <div v-if="step.type === 'revision'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowBuilder.returnToLabel') }}</label>
          <select v-model="step.return_to" class="select-field-sm w-full">
            <option value="">{{ t('workflowBuilder.selectPlaceholder') }}</option>
            <option v-for="s in stepIds" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <!-- Review/Delivery: revision_step -->
      <div v-if="step.type === 'review' || step.type === 'delivery'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('workflowBuilder.pairedRevisionLabel') }}</label>
          <select v-model="step.revision_step" class="select-field-sm w-full">
            <option value="">{{ t('workflowBuilder.nonePlaceholder') }}</option>
            <option v-for="s in stepIds" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <!-- Transitions (for gate, review, delivery) -->
      <div v-if="step.type !== 'revision'" class="space-y-2">
        <div class="flex items-center gap-2">
          <label class="text-xs text-muted-foreground">{{ t('workflowBuilder.transitionsLabel') }}</label>
          <button @click="addTransition(idx)" class="text-xs text-primary hover:text-primary-hover">
            <Plus class="w-3 h-3 inline" /> {{ t('workflowBuilder.addTransition') }}
          </button>
        </div>
        <div v-for="(tr, trIdx) in step.transitions" :key="trIdx" class="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <input
            v-model="tr.decision"
            class="input-field text-xs !h-7 w-full sm:w-36 font-mono"
            placeholder="decision_key"
          />
          <span class="text-xs text-muted-foreground hidden sm:inline">&rarr;</span>
          <select v-model="tr.target" class="select-field-sm w-full sm:flex-1">
            <option value="">{{ t('workflowBuilder.targetPlaceholder') }}</option>
            <option v-for="opt in targetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <button @click="removeTransition(idx, trIdx)" class="p-1 hover:text-error text-muted-foreground ml-auto sm:ml-0">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Validation errors -->
    <div v-if="errors.length" class="space-y-1">
      <p v-for="(err, i) in errors" :key="i" class="text-xs text-error">{{ err }}</p>
    </div>
  </div>
</template>
