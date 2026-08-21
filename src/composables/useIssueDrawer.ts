import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Issue } from '@/types'

interface IssueDrawerDeps {
  issues: Ref<Issue[]>
  selectedIssue: Ref<Issue | null>
  /** Return true when the issue should open in the legacy full page instead of the inline drawer. */
  shouldUseLegacyPage?: () => boolean
  openLegacyPage?: (issueId: number) => void
}

export function useIssueDrawer({ issues, selectedIssue, shouldUseLegacyPage, openLegacyPage }: IssueDrawerDeps) {
  const route = useRoute()
  const router = useRouter()

  function parseIssueQuery(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value
    const issueId = Number(raw)
    return Number.isInteger(issueId) && issueId > 0 ? issueId : null
  }

  function buildRouteQueryWithoutIssue(): Record<string, string> {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (key === 'issue') continue
      if (typeof value === 'string' && value.length > 0) query[key] = value
      else if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) query[key] = value[0]
    }
    return query
  }

  function replaceIssueDrawerQuery(issueId: number | null) {
    const query = buildRouteQueryWithoutIssue()
    if (issueId != null) query.issue = String(issueId)
    void router.replace({
      path: route.path,
      query: Object.keys(query).length > 0 ? query : undefined,
    })
  }

  function syncIssueDrawerFromRoute() {
    const issueId = parseIssueQuery(route.query.issue)
    if (issueId == null) {
      selectedIssue.value = null
      return
    }
    if (shouldUseLegacyPage?.()) {
      selectedIssue.value = null
      openLegacyPage?.(issueId)
      return
    }
    selectedIssue.value = issues.value.find(issue => issue.id === issueId) ?? null
  }

  function openIssueDrawer(issue: Issue) {
    selectedIssue.value = issue
    if (parseIssueQuery(route.query.issue) !== issue.id) {
      replaceIssueDrawerQuery(issue.id)
    }
  }

  function onIssueSelect(issue: Issue) {
    if (shouldUseLegacyPage?.()) {
      openLegacyPage?.(issue.id)
      return
    }
    openIssueDrawer(issue)
  }

  function closeIssueDrawer() {
    selectedIssue.value = null
    if (parseIssueQuery(route.query.issue) != null) {
      replaceIssueDrawerQuery(null)
    }
  }

  return {
    parseIssueQuery,
    buildRouteQueryWithoutIssue,
    replaceIssueDrawerQuery,
    syncIssueDrawerFromRoute,
    openIssueDrawer,
    onIssueSelect,
    closeIssueDrawer,
  }
}
