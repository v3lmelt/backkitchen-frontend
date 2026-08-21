import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { trackApi } from '@/api'
import type { Track, WorkflowConfig, WorkflowTransitionOption } from '@/types'
import { stepIsMasteringRelated, transitionRequiresConfirmation } from '@/utils/workflow'
import { useToast } from '@/composables/useToast'

export type RevisionType = 'source_audio' | 'stem_files'

export interface UseWorkflowTransitionOptions {
  trackId: Ref<number>
  track: Ref<Track | null>
  workflowConfig: Ref<WorkflowConfig | null>
  /** Error surface written to when a transition fails. */
  error: Ref<string>
  /** Reload the page data after a transition that kept the same status. */
  reload: () => Promise<void>
  /** Navigate back to the track detail page after a status-changing transition. */
  navigateToTrackDetail: () => void
  /** Runs before the API call (e.g. persisting a dirty peer-review checklist). */
  beforeTransition?: () => Promise<void>
  /** Extra synchronous confirmation gate; return false to abort the transition. */
  confirmDecision?: (decision: string) => boolean
}

/**
 * Shared workflow-transition flow for the track workspaces (workflow step page
 * and mastering page): executes a decision through the generic endpoint,
 * intercepts transitions that lead to a mastering revision step to collect the
 * required revision type first, reloads in place when the status is unchanged,
 * and navigates back to the track detail page otherwise.
 */
export function useWorkflowTransition(options: UseWorkflowTransitionOptions) {
  const { t } = useI18n()
  const { success: toastSuccess } = useToast()

  const acting = ref(false)
  const revisionTypeModalOpen = ref(false)
  const pendingRevisionDecision = ref<string | null>(null)
  const selectedRevisionType = ref<RevisionType>('source_audio')

  const transitions = computed<WorkflowTransitionOption[]>(
    () => options.track.value?.workflow_transitions ?? [],
  )

  function willTransitionToMasteringRevision(decision: string): boolean {
    const step = options.track.value?.workflow_step
    if (!step || !options.workflowConfig.value) return false
    if (!stepIsMasteringRelated(step)) return false

    const targetStepId = step.transitions?.[decision]
    if (!targetStepId) return false
    const targetStep = options.workflowConfig.value.steps.find(item => item.id === targetStepId)
    return targetStep?.type === 'revision' && targetStep.return_to === step.id
  }

  async function executeTransition(decision: string) {
    if (!options.track.value) return

    if (willTransitionToMasteringRevision(decision)) {
      // Revision type is required for mastering revisions — ask first.
      pendingRevisionDecision.value = decision
      selectedRevisionType.value = 'source_audio'
      revisionTypeModalOpen.value = true
      return
    }

    const transition = transitions.value.find(item => item.decision === decision)
    if (transitionRequiresConfirmation(transition, decision)) {
      const confirmed = window.confirm(t('producer.rejectFinalConfirm'))
      if (!confirmed) return
    }
    if (options.confirmDecision && !options.confirmDecision(decision)) return
    await runTransition(decision)
  }

  async function confirmRevisionType() {
    if (!pendingRevisionDecision.value) return
    const decision = pendingRevisionDecision.value
    const revisionType = selectedRevisionType.value
    revisionTypeModalOpen.value = false
    pendingRevisionDecision.value = null
    await runTransition(decision, revisionType)
  }

  async function runTransition(decision: string, revisionType?: RevisionType) {
    if (!options.track.value) return
    const previousStatus = options.track.value.status
    acting.value = true
    options.error.value = ''
    try {
      await options.beforeTransition?.()
      const updatedTrack = revisionType != null
        ? await trackApi.workflowTransition(options.trackId.value, decision, revisionType)
        : await trackApi.workflowTransition(options.trackId.value, decision)
      if (updatedTrack.status === previousStatus) {
        await options.reload()
        toastSuccess(t('workflowStep.actionSubmitted'))
        return
      }
      options.navigateToTrackDetail()
    } catch (err: any) {
      options.error.value = err.message || t('workflowStep.transitionFailed')
    } finally {
      acting.value = false
    }
  }

  return {
    acting,
    transitions,
    revisionTypeModalOpen,
    pendingRevisionDecision,
    selectedRevisionType,
    willTransitionToMasteringRevision,
    executeTransition,
    confirmRevisionType,
  }
}
