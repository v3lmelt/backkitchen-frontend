<script setup lang="ts">
import { ref, computed, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import type { Issue, MasterDelivery, MentionCandidates, StageAssignment, Track, TrackSourceVersion } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import IssueDetailContent from '@/components/IssueDetailContent.vue'
import OriginalIssuePlayback from '@/components/issue/OriginalIssuePlayback.vue'
import { issueOriginLabel } from '@/utils/issueAudio'
import { formatTimestamp } from '@/utils/time'
import { anonTokenFor } from '@/utils/hash'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  issue: Issue | null
  track?: Track | null
  assignments?: StageAssignment[]
  issues?: Issue[] | null
  mentionCandidates?: MentionCandidates | null
  sourceVersions?: TrackSourceVersion[]
  masterDeliveries?: MasterDelivery[]
}>()

const emit = defineEmits<{
  close: []
  updated: [issue: Issue]
  'open-issue': [issueId: number]
}>()

const { t } = useI18n()

const fullIssue = ref<Issue | null>(null)
const issue = ref<Issue | null>(null)
const loading = ref(false)
const contentRef = ref<InstanceType<typeof IssueDetailContent> | null>(null)

const previewRef = ref<InstanceType<typeof OriginalIssuePlayback> | null>(null)
const previewIssue = computed(() => fullIssue.value ?? issue.value)
let detailRequest = 0

watch(() => props.issue, async (nextIssue) => {
  const request = ++detailRequest
  if (!nextIssue) { loading.value = false; return }
  contentRef.value?.reset()
  issue.value = nextIssue
  fullIssue.value = nextIssue
  loading.value = true
  try {
    const detail = await issueApi.get(nextIssue.id)
    if (request === detailRequest && props.issue?.id === detail.id) fullIssue.value = detail
  } catch {
    // Keep the already-visible issue context when detail/comments cannot load.
  } finally {
    if (request === detailRequest) loading.value = false
  }
}, { immediate: true })

function afterLeave() {
  if (props.issue) return
  issue.value = null
  fullIssue.value = null
  contentRef.value?.reset()
}

function formatTime(s: number) { return formatTimestamp(s) }

function authorLabel(issue: Issue): string {
  if (issue.phase === 'peer') return `#${anonTokenFor(issue.author, issue.author_id)}`
  return issue.author?.display_name ?? `#${issue.author_id}`
}

function onContentUpdated(updated: Issue) {
  fullIssue.value = updated
  emit('updated', updated)
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="idp-fade">
      <div
        v-if="props.issue"
        class="fixed inset-0 z-40 bg-overlay/50"
        @click="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="idp-slide" @after-leave="afterLeave">
      <div
        v-if="props.issue && issue"
        class="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] max-h-[88dvh] w-full flex-col border-t border-border bg-card sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[460px] sm:border-l sm:border-t-0"
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-border flex items-start gap-3 flex-shrink-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span class="inline-flex border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-foreground">
                {{ issueOriginLabel(fullIssue ?? issue, t, track ?? null, sourceVersions) }}
              </span>
              <StatusBadge :status="issue.phase" type="phase" />
              <StatusBadge :status="issue.severity" type="severity" />
              <StatusBadge :status="issue.status" type="issue" />
            </div>
            <h2 class="text-base font-mono font-bold text-foreground leading-snug">
              {{ fullIssue?.title ?? issue.title }}
            </h2>
            <p class="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span v-if="issue.markers.length === 0" class="italic">{{ t('issue.generalIssue') }}</span>
              <span v-else>
                <template v-for="(m, mi) in issue.markers" :key="mi">
                  <span v-if="mi > 0" class="text-border mx-1">·</span>
                  <span>{{ formatTime(m.time_start) }}<span v-if="m.time_end"> – {{ formatTime(m.time_end) }}</span></span>
                </template>
              </span>
              <span class="text-border">·</span>
              <span :class="issue.phase === 'peer' ? 'font-mono' : ''">{{ authorLabel(issue) }}</span>
            </p>
          </div>
          <button
            @click="emit('close')"
            class="ui-control flex-shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
            :aria-label="t('common.close')"
          >
            <X class="w-5 h-5" :stroke-width="2" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div v-if="fullIssue" class="flex-1 overflow-y-auto p-5 space-y-5">
          <IssueDetailContent
            ref="contentRef"
            :issue="fullIssue"
            variant="panel"
            :track="track"
            :assignments="assignments"
            :issues="issues"
            :mention-candidates="mentionCandidates"
            @updated="onContentUpdated"
            @track-reference="previewRef?.playFrom($event)"
            @open-issue="(issueId) => emit('open-issue', issueId)"
          >
            <template #preview>
              <OriginalIssuePlayback
                v-if="previewIssue"
                :key="previewIssue.id"
                ref="previewRef"
                :issue="previewIssue"
                :track="track"
                :source-versions="sourceVersions"
                :master-deliveries="masterDeliveries"
              />
            </template>
          </IssueDetailContent>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.idp-fade-enter-active { transition: opacity var(--motion-panel-in) var(--motion-ease-out); }
.idp-fade-leave-active { transition: opacity var(--motion-panel-out) var(--motion-ease-in); }
.idp-fade-enter-from, .idp-fade-leave-to { opacity: 0; }

.idp-slide-enter-active { transition: transform var(--motion-panel-in) var(--motion-ease-out); }
.idp-slide-leave-active { transition: transform var(--motion-panel-out) var(--motion-ease-in); }
.idp-slide-enter-from, .idp-slide-leave-to { transform: translateY(100%); }

@media (min-width: 640px) {
  .idp-slide-enter-from, .idp-slide-leave-to { transform: translateX(100%); }
}
</style>
