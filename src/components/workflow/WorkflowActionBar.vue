<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, RotateCcw, X } from 'lucide-vue-next'
import BaseModal from '@/components/common/BaseModal.vue'

export interface WorkflowActionConfirm {
  title?: string
  message: string
  confirmLabel?: string
}

export interface WorkflowAction {
  label: string
  /** 'advance' = forward step (prominent), 'return' = send back, 'reject' = destructive */
  type: 'advance' | 'return' | 'reject'
  disabled?: boolean
  handler: () => void
  /** If set, clicking shows a confirmation dialog before calling handler */
  confirm?: WorkflowActionConfirm
}

const props = withDefaults(defineProps<{
  actions: WorkflowAction[]
  /** Optional one-line hint shown above buttons */
  hint?: string
  /** Use grouped layout when decisions should sit in one cluster. */
  layout?: 'split' | 'grouped'
  /** Optional label above grouped decision buttons. */
  groupLabel?: string
}>(), {
  layout: 'split',
})

const { t } = useI18n()
const pendingAction = ref<WorkflowAction | null>(null)

function handleClick(action: WorkflowAction) {
  if (action.confirm) {
    pendingAction.value = action
  } else {
    action.handler()
  }
}

function confirmPending() {
  pendingAction.value?.handler()
  pendingAction.value = null
}
</script>

<template>
  <!-- Confirmation modal -->
  <BaseModal v-if="pendingAction" @close="pendingAction = null" max-width="max-w-sm" :closable="false">
    <div class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground">
        {{ pendingAction.confirm?.title ?? pendingAction.label }}
      </h3>
      <p class="text-sm text-muted-foreground leading-relaxed">{{ pendingAction.confirm?.message }}</p>
      <div class="flex gap-2 pt-1">
        <button
          @click="confirmPending"
          :class="[
            'flex-1 rounded-full font-mono font-medium text-sm h-9 transition-colors',
            pendingAction.type === 'reject'
              ? 'bg-error hover:bg-error/80 text-white'
              : 'border border-muted-foreground/40 text-foreground hover:bg-foreground/5',
          ]"
        >
          {{ pendingAction.confirm?.confirmLabel ?? t('common.confirm') }}
        </button>
        <button @click="pendingAction = null" class="flex-1 btn-secondary h-9 text-sm">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </BaseModal>

  <div class="fixed-bottom-bar-spacer" aria-hidden="true"></div>

  <div class="workflow-action-bar fixed-bottom-bar">
    <div class="bar-surface fixed-bottom-bar__surface">
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">

        <!-- Left: hint -->
        <div v-if="props.hint" class="inline-flex max-w-full items-center gap-3 self-start rounded-full border border-warning/30 bg-warning-bg px-3 py-2 sm:flex-none">
          <span class="pulse-dot flex-shrink-0"></span>
          <p class="text-sm font-mono font-medium text-warning tracking-wide leading-none">{{ props.hint }}</p>
        </div>

        <!-- Right: actions -->
        <div v-if="props.layout === 'grouped'" class="w-full sm:ml-auto sm:w-auto">
          <div class="grouped-action-wrap">
            <p v-if="props.groupLabel" class="grouped-action-label">{{ props.groupLabel }}</p>
            <div class="decision-group">
              <button
                v-for="action in props.actions"
                :key="action.label"
                :disabled="action.disabled"
                @click="handleClick(action)"
                :class="[
                  'grouped-btn group flex items-center justify-center gap-2 rounded-full font-mono text-sm px-4 h-10 transition-all duration-200 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed',
                  action.type === 'advance'
                    ? 'grouped-btn-advance'
                    : action.type === 'reject'
                      ? 'grouped-btn-reject'
                      : 'grouped-btn-return',
                ]"
              >
                <RotateCcw
                  v-if="action.type === 'return'"
                  class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 group-hover:-rotate-90"
                  :stroke-width="2"
                />
                <X
                  v-else-if="action.type === 'reject'"
                  class="w-3.5 h-3.5 flex-shrink-0"
                  :stroke-width="2"
                />
                <ChevronRight
                  v-else
                  class="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                  :stroke-width="2.5"
                />
                {{ action.label }}
              </button>
            </div>
          </div>
        </div>

        <div v-else class="flex flex-wrap items-center gap-2 sm:ml-auto">
          <!-- Secondary: return / reject -->
          <button
            v-for="action in props.actions.filter(a => a.type !== 'advance')"
            :key="action.label"
            :disabled="action.disabled"
            @click="handleClick(action)"
            :class="[
              'ghost-btn group flex items-center gap-2 rounded-full font-mono font-medium text-sm px-4 h-9 transition-all duration-200 whitespace-nowrap',
              action.type === 'reject'
                ? 'text-error border-error/30 hover:bg-error/10'
                : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground',
              'border disabled:opacity-30 disabled:cursor-not-allowed',
            ]"
          >
            <RotateCcw
              v-if="action.type === 'return'"
              class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300 group-hover:-rotate-90"
              :stroke-width="2"
            />
            <X
              v-if="action.type === 'reject'"
              class="w-3.5 h-3.5 flex-shrink-0"
              :stroke-width="2"
            />
            {{ action.label }}
          </button>

          <!-- Primary: advance -->
          <button
            v-for="action in props.actions.filter(a => a.type === 'advance')"
            :key="action.label"
            :disabled="action.disabled"
            @click="handleClick(action)"
            class="advance-btn group relative overflow-hidden flex items-center justify-center gap-2 rounded-full font-mono font-semibold text-sm px-6 h-10
                   w-full sm:w-auto disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <!-- shimmer sweep -->
            <span class="shimmer" aria-hidden="true"></span>
            <span class="relative z-10 whitespace-nowrap">{{ action.label }}</span>
            <ChevronRight
              class="relative z-10 w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              :stroke-width="2.5"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar-surface {
  background: transparent;
}

/* ── Pulsing status dot ── */
.pulse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FF8400;
  animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1;   transform: scale(1);    box-shadow: 0 0 0 0 rgba(255,132,0,0.4); }
  50%       { opacity: 0.5; transform: scale(0.75); box-shadow: 0 0 0 4px rgba(255,132,0,0);  }
}

/* ── Ghost secondary button ── */
.ghost-btn {
  background: transparent;
}

.grouped-action-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.grouped-action-label {
  margin: 0;
  text-align: right;
  font-family: var(--font-mono, inherit);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #B8B9B6;
}

.decision-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: flex-end;
  width: 100%;
  padding: 0.25rem;
  border: 1px solid #2E2E2E;
  border-radius: 9999px;
  background: #1A1A1A;
}

.grouped-btn {
  flex: 1 1 10rem;
  min-width: 0;
  border: 1px solid transparent;
}

.grouped-btn-return {
  background: transparent;
  color: #FFFFFF;
}

.grouped-btn-return:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.grouped-btn-reject {
  background: transparent;
  color: #FF5C33;
  border-color: rgba(255, 92, 51, 0.22);
}

.grouped-btn-reject:hover:not(:disabled) {
  background: rgba(255, 92, 51, 0.1);
}

.grouped-btn-advance {
  background: #FF8400;
  color: #111111;
  font-weight: 600;
}

.grouped-btn-advance:hover:not(:disabled) {
  background: #CC6A00;
}

@media (min-width: 640px) {
  .grouped-action-wrap {
    width: auto;
  }

  .decision-group {
    width: auto;
  }

  .grouped-btn {
    flex: 0 0 auto;
  }
}

/* ── Primary advance button ── */
.advance-btn {
  background: #FF8400;
  color: #111111;
}

.advance-btn:hover:not(:disabled) {
  background: #E87800;
}

/* shimmer layer */
.shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 35%,
    rgba(255, 255, 255, 0.18) 50%,
    transparent 65%
  );
  transform: translateX(-100%);
  transition: none;
}

.advance-btn:hover:not(:disabled) .shimmer {
  transform: translateX(100%);
  transition: transform 0.45s ease;
}

/* subtle idle glow on advance */
.advance-btn:not(:disabled) {
  box-shadow: 0 0 18px rgba(255, 132, 0, 0.22);
  animation: idle-glow 3s ease-in-out infinite;
}

@keyframes idle-glow {
  0%, 100% { box-shadow: 0 0 18px rgba(255,132,0,0.20); }
  50%       { box-shadow: 0 0 28px rgba(255,132,0,0.40); }
}
</style>
