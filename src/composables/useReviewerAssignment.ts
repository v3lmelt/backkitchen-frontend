import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { trackApi } from '@/api'
import type { ReviewerCandidate, StageAssignment, Track, WorkflowStepDef } from '@/types'
import { useToast } from '@/composables/useToast'

export interface UseReviewerAssignmentOptions {
  track: Ref<Track | null>
  currentStep: Ref<WorkflowStepDef | null>
  currentStepAssignments: Ref<StageAssignment[]>
  /** Whether the viewer may assign reviewers on the current step. */
  canManage: Ref<boolean>
  /** Error surface written to when loading/saving fails. */
  error: Ref<string>
  /** Reload the page data after a successful assignment change. */
  reload: () => Promise<void>
}

/**
 * Reviewer assignment state for review-type workflow steps: the assignment
 * modal, candidate members, selection limits, and the assign/reassign calls.
 * Automatic assignment modes skip the modal and reassign immediately.
 */
export function useReviewerAssignment({
  track,
  currentStep,
  currentStepAssignments,
  canManage,
  error,
  reload,
}: UseReviewerAssignmentOptions) {
  const { t } = useI18n()
  const { success: toastSuccess, error: toastError } = useToast()

  const modalOpen = ref(false)
  const members = ref<ReviewerCandidate[]>([])
  const selectedUserIds = ref<number[]>([])
  const loadingMembers = ref(false)
  const saving = ref(false)

  const isAutomatic = computed(() => {
    const step = currentStep.value
    return step?.assignment_mode === 'auto' || step?.assignment_mode === 'fixed' || step?.assignee_user_id != null
  })
  const limit = computed(() => Math.max(1, currentStep.value?.required_reviewer_count ?? 1))
  const canSelectMore = computed(() => selectedUserIds.value.length < limit.value)
  const buttonLabel = computed(() =>
    currentStepAssignments.value.length > 0
      ? t('workflowStep.reassignReviewer')
      : t('workflowStep.assignReviewer'),
  )
  const selectionSummary = computed(() => t('workflowStep.reviewerAssignmentSelectionSummary', {
    selected: selectedUserIds.value.length,
    limit: limit.value,
  }))
  const confirmDisabled = computed(() =>
    saving.value
    || loadingMembers.value
    || selectedUserIds.value.length < limit.value,
  )

  function isMemberDisabled(userId: number): boolean {
    if (selectedUserIds.value.includes(userId)) return false
    return !canSelectMore.value
  }

  function prefillSelection() {
    selectedUserIds.value = currentStepAssignments.value
      .filter(assignment => assignment.status === 'pending')
      .map(assignment => assignment.user_id)
      .slice(0, limit.value)
  }

  async function open() {
    if (!track.value || !canManage.value) return
    error.value = ''
    if (isAutomatic.value) {
      await submit()
      return
    }

    prefillSelection()
    modalOpen.value = true
    loadingMembers.value = true
    try {
      members.value = await trackApi.listReviewerCandidates(track.value.id)
    } catch (err: any) {
      error.value = err.message || t('common.requestFailed')
    } finally {
      loadingMembers.value = false
    }
  }

  function closeModal() {
    if (saving.value) return
    modalOpen.value = false
  }

  function toggleMember(userId: number) {
    const exists = selectedUserIds.value.includes(userId)
    if (exists) {
      selectedUserIds.value = selectedUserIds.value.filter(id => id !== userId)
      return
    }
    if (!canSelectMore.value) return
    selectedUserIds.value = [...selectedUserIds.value, userId]
  }

  async function submit() {
    if (!track.value || !canManage.value) return
    const userIds = [...selectedUserIds.value]
    if (!isAutomatic.value && userIds.length < limit.value) return

    saving.value = true
    error.value = ''
    try {
      if (isAutomatic.value) {
        const updated = await trackApi.reassignReviewer(track.value.id)
        if (updated.peer_reviewer_id == null) {
          toastError(t('workflowStep.reviewerAssignmentNoPool'))
        } else {
          toastSuccess(t('workflowStep.reviewerAssignmentDone'))
        }
      } else if (currentStepAssignments.value.length === 0) {
        await trackApi.assignReviewer(track.value.id, userIds)
        toastSuccess(t('workflowStep.reviewerAssignmentDone'))
      } else {
        await trackApi.reassignReviewer(track.value.id, userIds)
        toastSuccess(t('workflowStep.reviewerAssignmentDone'))
      }
      modalOpen.value = false
      selectedUserIds.value = []
      await reload()
    } catch (err: any) {
      error.value = err.message || t('common.requestFailed')
    } finally {
      saving.value = false
    }
  }

  /** Reset everything when navigating to a different track. */
  function reset() {
    modalOpen.value = false
    members.value = []
    selectedUserIds.value = []
  }

  return {
    modalOpen,
    members,
    selectedUserIds,
    loadingMembers,
    saving,
    limit,
    buttonLabel,
    selectionSummary,
    confirmDisabled,
    isMemberDisabled,
    open,
    closeModal,
    toggleMember,
    submit,
    reset,
  }
}
