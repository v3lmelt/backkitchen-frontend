import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'

import type { IssueStatus } from '@/types'

import {
  availableIssueStatusActions,
  isInternalIssueStatus,
  isIssueOpenOrInternal,
  isIssueResolvedLike,
  isIssueUnresolved,
  issueStatusActionHint,
  issueStatusActionLabel,
  issueStatusPanelActionClass,
  issueStatusQuickActionClass,
} from './issueStatus'

const t = ((key: string) => key) as ComposerTranslation

describe('availableIssueStatusActions', () => {
  it('offers submit transitions to composer actors on open issues', () => {
    expect(availableIssueStatusActions('open', { canSubmit: true, canChange: false }))
      .toEqual(['resolved', 'disagreed'])
  })

  it('offers change transitions to reviewers', () => {
    expect(availableIssueStatusActions('open', { canSubmit: false, canChange: true }))
      .toEqual(['resolved', 'pending_discussion'])
    expect(availableIssueStatusActions('pending_discussion', { canSubmit: false, canChange: true }))
      .toEqual(['open', 'internal_resolved'])
    expect(availableIssueStatusActions('internal_resolved', { canSubmit: false, canChange: true }))
      .toEqual(['open'])
    expect(availableIssueStatusActions('resolved', { canSubmit: false, canChange: true }))
      .toEqual(['open'])
    expect(availableIssueStatusActions('disagreed', { canSubmit: false, canChange: true }))
      .toEqual(['open'])
  })

  it('offers nothing without capabilities', () => {
    const statuses: IssueStatus[] = ['open', 'pending_discussion', 'internal_resolved', 'disagreed', 'resolved']
    for (const status of statuses) {
      expect(availableIssueStatusActions(status, { canSubmit: false, canChange: false })).toEqual([])
    }
  })

  it('submitExclusive hides change transitions from submitters (detail panels)', () => {
    expect(availableIssueStatusActions('resolved', { canSubmit: true, canChange: true, submitExclusive: true }))
      .toEqual([])
  })

  it('non-exclusive viewers fall through to change transitions (batch/quick actions)', () => {
    expect(availableIssueStatusActions('resolved', { canSubmit: true, canChange: true }))
      .toEqual(['open'])
    expect(availableIssueStatusActions('open', { canSubmit: true, canChange: true }))
      .toEqual(['resolved', 'disagreed'])
  })
})

describe('status predicates', () => {
  it('isInternalIssueStatus', () => {
    expect(isInternalIssueStatus('pending_discussion')).toBe(true)
    expect(isInternalIssueStatus('internal_resolved')).toBe(true)
    expect(isInternalIssueStatus('open')).toBe(false)
    expect(isInternalIssueStatus(null)).toBe(false)
  })

  it('isIssueUnresolved covers open, pending_discussion and disagreed', () => {
    expect(isIssueUnresolved('open')).toBe(true)
    expect(isIssueUnresolved('pending_discussion')).toBe(true)
    expect(isIssueUnresolved('disagreed')).toBe(true)
    expect(isIssueUnresolved('resolved')).toBe(false)
    expect(isIssueUnresolved('internal_resolved')).toBe(false)
  })

  it('isIssueResolvedLike covers resolved and internal_resolved', () => {
    expect(isIssueResolvedLike('resolved')).toBe(true)
    expect(isIssueResolvedLike('internal_resolved')).toBe(true)
    expect(isIssueResolvedLike('open')).toBe(false)
  })

  it('isIssueOpenOrInternal is the unresolved-filter bucket (excludes disagreed)', () => {
    expect(isIssueOpenOrInternal('open')).toBe(true)
    expect(isIssueOpenOrInternal('pending_discussion')).toBe(true)
    expect(isIssueOpenOrInternal('disagreed')).toBe(false)
    expect(isIssueOpenOrInternal('resolved')).toBe(false)
    expect(isIssueOpenOrInternal('internal_resolved')).toBe(false)
  })
})

describe('issueStatusActionLabel', () => {
  it('labels reopening an internal issue as Publish', () => {
    expect(issueStatusActionLabel(t, 'open', { currentStatus: 'pending_discussion' }))
      .toBe('issueDetail.publish')
    expect(issueStatusActionLabel(t, 'open', { currentStatus: 'internal_resolved' }))
      .toBe('issueDetail.publish')
  })

  it('labels reopening a public issue as Reopen', () => {
    expect(issueStatusActionLabel(t, 'open', { currentStatus: 'resolved' }))
      .toBe('issueDetail.reopen')
    expect(issueStatusActionLabel(t, 'open')).toBe('issueDetail.reopen')
  })

  it('supports the markFixed variant used by quick actions', () => {
    expect(issueStatusActionLabel(t, 'resolved')).toBe('issueDetail.markResolved')
    expect(issueStatusActionLabel(t, 'resolved', { resolvedKey: 'issueDetail.markFixed' }))
      .toBe('issueDetail.markFixed')
  })

  it('labels the remaining statuses', () => {
    expect(issueStatusActionLabel(t, 'internal_resolved')).toBe('issueDetail.markInternalResolved')
    expect(issueStatusActionLabel(t, 'disagreed')).toBe('issueDetail.disagree')
    expect(issueStatusActionLabel(t, 'pending_discussion')).toBe('issueDetail.markPendingDiscussion')
  })
})

describe('issueStatusActionHint', () => {
  it('returns hints for internal transitions', () => {
    expect(issueStatusActionHint(t, 'pending_discussion')).toBe('issueDetail.pendingDiscussionHint')
    expect(issueStatusActionHint(t, 'internal_resolved')).toBe('issueDetail.internalResolvedHint')
    expect(issueStatusActionHint(t, 'open', 'pending_discussion')).toBe('issueDetail.publishHint')
    expect(issueStatusActionHint(t, 'resolved')).toBe('issueDetail.resolvedHint')
    expect(issueStatusActionHint(t, 'open', 'resolved')).toBe('')
    expect(issueStatusActionHint(t, 'disagreed')).toBe('')
  })
})

describe('action classes', () => {
  it('panel class reflects the pending selection', () => {
    expect(issueStatusPanelActionClass('resolved', true)).toContain('bg-success-bg')
    expect(issueStatusPanelActionClass('disagreed', true)).toContain('bg-error-bg')
    expect(issueStatusPanelActionClass('open', true)).toContain('bg-warning-bg')
    expect(issueStatusPanelActionClass('resolved', false)).toBe('bg-card border border-border text-foreground hover:bg-border')
  })

  it('quick action class is per-status', () => {
    expect(issueStatusQuickActionClass('resolved')).toContain('bg-success-bg')
    expect(issueStatusQuickActionClass('internal_resolved')).toContain('bg-info-bg')
    expect(issueStatusQuickActionClass('disagreed')).toContain('bg-info-bg')
    expect(issueStatusQuickActionClass('open')).toContain('bg-warning-bg')
    expect(issueStatusQuickActionClass('pending_discussion')).toContain('bg-warning-bg')
  })
})
