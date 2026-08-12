import type { ComposerTranslation } from 'vue-i18n'
import type { IssueStatus } from '@/types'

/**
 * Canonical issue phases, mirroring the backend `IssuePhase` enum
 * (`backend/app/models/issue.py`). Used as the fallback bucket when a
 * workflow step has no phase-specific issue mapping.
 */
export const FALLBACK_ISSUE_PHASES = ['peer', 'producer', 'mastering', 'final_review'] as const

/**
 * Issue status state machine — single source of truth.
 *
 * Two capability tracks exist side by side:
 * - `canSubmit`: a composer actor submitting their own verdict
 *   (`canUserSubmitIssueStatus` in `@/utils/reviewAssignments`)
 * - `canChange`: a reviewer / issue author / album manager driving the
 *   review workflow (`canUserChangeIssueStatus`)
 */

/** Transitions available to a composer actor (`canSubmit`). */
const SUBMIT_TRANSITIONS: Partial<Record<IssueStatus, IssueStatus[]>> = {
  open: ['resolved', 'disagreed'],
}

/** Transitions available to a reviewer / author / manager (`canChange`). */
const CHANGE_TRANSITIONS: Partial<Record<IssueStatus, IssueStatus[]>> = {
  open: ['resolved', 'pending_discussion'],
  pending_discussion: ['open', 'internal_resolved'],
  internal_resolved: ['open'],
  resolved: ['open'],
  disagreed: ['open'],
}

export interface IssueStatusActionsOptions {
  canSubmit: boolean
  canChange: boolean
  /**
   * When true and the viewer can submit, only the submit transitions are
   * offered — used by the detail panels. When false (batch bar, quick
   * actions), a viewer who can both submit and change falls through to the
   * change transitions for statuses the submit table does not cover.
   */
  submitExclusive?: boolean
}

/** Statuses an issue in `status` may be moved to by this viewer. */
export function availableIssueStatusActions(
  status: IssueStatus,
  options: IssueStatusActionsOptions,
): IssueStatus[] {
  const submitActions = options.canSubmit ? SUBMIT_TRANSITIONS[status] ?? [] : []
  if (options.submitExclusive && options.canSubmit) return submitActions
  if (submitActions.length > 0) return submitActions
  if (!options.canChange) return []
  return CHANGE_TRANSITIONS[status] ?? []
}

/** Internal (not yet published to the composer) statuses. */
export function isInternalIssueStatus(status: IssueStatus | string | null | undefined): boolean {
  return status === 'pending_discussion' || status === 'internal_resolved'
}

/** Unresolved-for-action: the issue still needs a reviewer/author decision. */
export function isIssueUnresolved(status: IssueStatus | string | null | undefined): boolean {
  return status === 'open' || status === 'pending_discussion' || status === 'disagreed'
}

/** Resolved-like for marker/display purposes. */
export function isIssueResolvedLike(status: IssueStatus | string | null | undefined): boolean {
  return status === 'resolved' || status === 'internal_resolved'
}

/**
 * "Unresolved" filter bucket on the issue detail page: issues still open or
 * held internally. Deliberately narrower than `isIssueUnresolved` — the
 * sibling-navigation filter also hides `disagreed` issues.
 */
export function isIssueOpenOrInternal(status: IssueStatus | string | null | undefined): boolean {
  return status === 'open' || status === 'pending_discussion'
}

export interface IssueStatusLabelOptions {
  /**
   * The issue's current status. When provided and the issue moves from an
   * internal status back to `open`, the action is labelled "Publish"
   * instead of "Reopen".
   */
  currentStatus?: IssueStatus | null
  /** Label key for the `resolved` action; quick actions use `markFixed`. */
  resolvedKey?: 'issueDetail.markResolved' | 'issueDetail.markFixed'
}

export function issueStatusActionLabel(
  t: ComposerTranslation,
  status: IssueStatus,
  options: IssueStatusLabelOptions = {},
): string {
  if (status === 'open' && isInternalIssueStatus(options.currentStatus)) {
    return t('issueDetail.publish')
  }
  switch (status) {
    case 'resolved':
      return t(options.resolvedKey ?? 'issueDetail.markResolved')
    case 'internal_resolved':
      return t('issueDetail.markInternalResolved')
    case 'disagreed':
      return t('issueDetail.disagree')
    case 'open':
      return t('issueDetail.reopen')
    case 'pending_discussion':
      return t('issueDetail.markPendingDiscussion')
  }
}

/** Explanatory hint shown under the status note box in the detail panel. */
export function issueStatusActionHint(
  t: ComposerTranslation,
  status: IssueStatus,
  currentStatus?: IssueStatus | null,
): string {
  if (status === 'pending_discussion') return t('issueDetail.pendingDiscussionHint')
  if (status === 'internal_resolved') return t('issueDetail.internalResolvedHint')
  if (status === 'open' && isInternalIssueStatus(currentStatus)) return t('issueDetail.publishHint')
  if (status === 'resolved') return t('issueDetail.resolvedHint')
  return ''
}

/** Selected/unselected pill styling used by the issue detail panels. */
export function issueStatusPanelActionClass(status: IssueStatus, isPending: boolean): string {
  if (isPending) {
    if (status === 'resolved') return 'bg-success-bg text-success border border-success/30'
    if (status === 'internal_resolved') return 'bg-info-bg text-info border border-info/30'
    if (status === 'disagreed') return 'bg-error-bg text-error border border-error/30'
    return 'bg-warning-bg text-warning border border-warning/30'
  }
  return 'bg-card border border-border text-foreground hover:bg-border'
}

/** Quick-action pill styling used by the marker list and batch action bar. */
export function issueStatusQuickActionClass(status: IssueStatus): string {
  switch (status) {
    case 'resolved':
      return 'bg-success-bg text-success hover:border-success/40'
    case 'internal_resolved':
      return 'bg-info-bg text-info hover:border-info/40'
    case 'disagreed':
      return 'bg-info-bg text-info hover:border-info/40'
    case 'open':
      return 'bg-warning-bg text-warning hover:border-warning/40'
    case 'pending_discussion':
      return 'bg-warning-bg text-warning hover:border-warning/40'
  }
}
