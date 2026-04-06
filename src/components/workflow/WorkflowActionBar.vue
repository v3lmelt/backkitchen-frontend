<script setup lang="ts">
import { ChevronRight, RotateCcw, X } from 'lucide-vue-next'

export interface WorkflowAction {
  label: string
  /** 'advance' = forward step (prominent), 'return' = send back, 'reject' = destructive */
  type: 'advance' | 'return' | 'reject'
  disabled?: boolean
  handler: () => void
}

defineProps<{
  actions: WorkflowAction[]
  /** Optional one-line hint shown above buttons */
  hint?: string
}>()
</script>

<template>
  <div class="workflow-action-bar mt-auto sticky bottom-0 z-40 -mx-4 md:-mx-6 -mb-4 md:-mb-6 pt-4">
    <div class="bar-surface border-t border-border px-4 md:px-8 py-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">

        <!-- Left: hint -->
        <div v-if="hint" class="inline-flex max-w-full items-center gap-3 self-start rounded-full border border-warning/30 bg-warning-bg px-3 py-2 sm:flex-none">
          <span class="pulse-dot flex-shrink-0"></span>
          <p class="text-sm font-mono font-medium text-warning tracking-wide leading-none">{{ hint }}</p>
        </div>

        <!-- Right: actions -->
        <div class="flex items-center gap-2 sm:ml-auto flex-shrink-0">
          <!-- Secondary: return / reject -->
          <button
            v-for="action in actions.filter(a => a.type !== 'advance')"
            :key="action.label"
            :disabled="action.disabled"
            @click="action.handler()"
            :class="[
              'ghost-btn group flex items-center gap-2 rounded-full font-mono font-medium text-sm px-4 h-9 transition-all duration-200',
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
            v-for="action in actions.filter(a => a.type === 'advance')"
            :key="action.label"
            :disabled="action.disabled"
            @click="action.handler()"
            class="advance-btn group relative overflow-hidden flex items-center gap-2 rounded-full font-mono font-semibold text-sm px-6 h-10
                   disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <!-- shimmer sweep -->
            <span class="shimmer" aria-hidden="true"></span>
            <span class="relative z-10">{{ action.label }}</span>
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
  background: #111111;
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
