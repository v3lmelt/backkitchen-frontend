import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import type { Issue } from '@/types'
import { useToast } from '@/composables/useToast'
import {
  availableBatchActionsForIssue as availableBatchActions,
  intersectBatchActions as intersectActions,
} from '@/utils/reviewAssignments'

interface BatchIssueActionsDeps {
  trackId: Ref<number>
  issues: Ref<Issue[]>
  selectedIssue?: Ref<Issue | null>
  canSubmitStatus: (issue: Issue) => boolean
  canChangeStatus: (issue: Issue) => boolean
}

export function useBatchIssueActions({
  trackId,
  issues,
  selectedIssue,
  canSubmitStatus,
  canChangeStatus,
}: BatchIssueActionsDeps) {
  const { t } = useI18n()
  const { error: toastError } = useToast()
  const batchUpdatingIssues = ref(false)

  function availableBatchActionsForIssue(issue: Issue): Issue['status'][] {
    return availableBatchActions(issue, canSubmitStatus(issue), canChangeStatus(issue))
  }

  function intersectBatchActions(selectedIssues: Issue[]): Issue['status'][] {
    return intersectActions(selectedIssues, availableBatchActionsForIssue)
  }

  async function applyBatchIssueStatusChange(
    selectedIssues: Issue[],
    selectedIds: Ref<number[]>,
    note: Ref<string>,
    status: Issue['status'],
  ) {
    if (!selectedIssues.length) return
    batchUpdatingIssues.value = true
    try {
      const updatedIssues = await issueApi.batchUpdate(trackId.value, {
        issue_ids: selectedIssues.map(issue => issue.id),
        status,
        status_note: note.value.trim() || undefined,
      })
      const updatedById = new Map(updatedIssues.map(issue => [issue.id, issue]))
      issues.value = issues.value.map((issue) => {
        const updated = updatedById.get(issue.id)
        return updated ? { ...issue, ...updated } : issue
      })
      if (selectedIssue?.value && updatedById.has(selectedIssue.value.id)) {
        selectedIssue.value = { ...selectedIssue.value, ...updatedById.get(selectedIssue.value.id)! }
      }
      selectedIds.value = []
      note.value = ''
    } catch (err: any) {
      toastError(err.message || t('workflowStep.transitionFailed'))
    } finally {
      batchUpdatingIssues.value = false
    }
  }

  return {
    batchUpdatingIssues,
    availableBatchActionsForIssue,
    intersectBatchActions,
    applyBatchIssueStatusChange,
  }
}
