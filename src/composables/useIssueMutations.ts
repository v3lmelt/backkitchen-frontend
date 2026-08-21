import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { issueApi } from '@/api'
import type { Issue } from '@/types'
import { useToast } from '@/composables/useToast'

export interface UseIssueMutationsOptions {
  /** Visible issue list; updated in place when an issue changes. */
  issues: Ref<Issue[]>
  /** Currently open issue in the drawer, kept in sync with list updates. */
  selectedIssue: Ref<Issue | null>
}

/**
 * Shared issue mutations for the track workspaces (workflow step page and
 * mastering page): applies an updated issue to the local list and the open
 * drawer selection, and performs quick status changes optimistically with a
 * rollback and error toast when the API call fails.
 */
export function useIssueMutations({ issues, selectedIssue }: UseIssueMutationsOptions) {
  const { t } = useI18n()
  const { error: toastError } = useToast()

  function onIssueUpdated(updatedIssue: Issue) {
    issues.value = issues.value.map(issue => issue.id === updatedIssue.id ? updatedIssue : issue)
    if (selectedIssue.value?.id === updatedIssue.id) {
      selectedIssue.value = updatedIssue
    }
  }

  async function onQuickIssueStatusChange({ issue, status }: { issue: Issue; status: Issue['status'] }) {
    const previousIssue = { ...issue }
    onIssueUpdated({ ...issue, status })
    try {
      const updatedIssue = await issueApi.update(issue.id, { status })
      onIssueUpdated(updatedIssue)
    } catch (err: any) {
      // Roll back only when the local entry is still the snapshot we started
      // from. A WebSocket-triggered reload may have replaced the whole list
      // with a collaborator's newer state while the request was in flight;
      // overwriting that fresh data with the stale snapshot would lose it.
      const currentIssue = issues.value.find(item => item.id === issue.id)
      if (currentIssue && currentIssue.updated_at === previousIssue.updated_at) {
        onIssueUpdated(previousIssue)
      }
      toastError(err.message || t('workflowStep.transitionFailed'))
    }
  }

  return {
    onIssueUpdated,
    onQuickIssueStatusChange,
  }
}
