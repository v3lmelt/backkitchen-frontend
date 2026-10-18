import { describe, expect, it } from 'vitest'
import { sourceVersionAudioUrl, masterDeliveryAudioUrl } from '@/api'
import { createTestI18n } from '@/tests/utils'
import { historyIssue, historyMaster, historySource, historyTrack } from '@/tests/issueHistoryFixtures'
import { currentPlayableSource, currentSourceAudioUrl, issueBelongsToCurrentVersion, issueOriginLabel, issuesForMasterAudio, issuesForSourceAudio, resolveIssueAudio } from './issueAudio'

const t = createTestI18n().global.t

describe('issue audio identities', () => {
  it('uses immutable IDs rather than equal version numbers or comparison selection for current membership', () => {
    const track = historyTrack()
    const issues = [historyIssue(), historyIssue({ id: 2, source_version_id: 99, source_version_number: 3 }),
      historyIssue({ id: 3, source_version_id: null, source_version_number: 3 }),
      historyIssue({ id: 4, source_version_id: null, source_version_number: null, markers: [] }),
      historyIssue({ id: 5, workflow_cycle: 1, source_version_id: null, source_version_number: null }),
      historyIssue({ id: 6, source_version_id: null, master_delivery_id: 22 }),
      historyIssue({ id: 7, source_version_id: null, master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 })]
    expect(issues.filter(issue => issueBelongsToCurrentVersion(issue, track)).map(issue => issue.id)).toEqual([1, 4, 6])
    expect(issuesForSourceAudio(issues, historySource(), track, true).map(issue => issue.id)).toEqual([1])
    expect(issuesForSourceAudio(issues, historySource(99, 3), track).map(issue => issue.id)).toEqual([2])
    expect(issuesForSourceAudio(issues, null, track).map(issue => issue.id)).toEqual([])
  })

  it('keeps external handoff IDs separate from the physically preserved source file', () => {
    const previous = historySource(12, 2)
    const external = historySource(13, 3, { source_kind: 'external_link', file_path: null })
    const track = historyTrack({ file_path: previous.file_path, current_source_version: external, source_versions: [previous, external] })
    expect(currentPlayableSource(track, track.source_versions)).toEqual(previous)
    expect(currentSourceAudioUrl(track, track.source_versions)).toBe(sourceVersionAudioUrl(9, previous))
    const issues = [historyIssue(), historyIssue({ id: 2, source_version_id: 12, source_version_number: 2 })]
    expect(issuesForSourceAudio(issues, currentPlayableSource(track, track.source_versions), track, true).map(issue => issue.id)).toEqual([2])
    expect(issueBelongsToCurrentVersion(issues[0], track)).toBe(true)
    expect(resolveIssueAudio(issues[0], track)).toBe('')
  })

  it('never substitutes current audio for missing, expired, external or old unbound source context', () => {
    const track = historyTrack({ source_versions: [historySource(), historySource(11, 1, { file_path: null }),
      historySource(12, 2, { source_kind: 'external_link', file_path: null })] })
    for (const issue of [historyIssue({ source_version_id: 99 }), historyIssue({ source_version_id: 11 }),
      historyIssue({ source_version_id: 12 }), historyIssue({ source_version_id: null, source_version_number: null, workflow_cycle: 1 }),
      historyIssue({ source_version_id: null, source_version_number: 3 })]) expect(resolveIssueAudio(issue, track)).toBe('')
    expect(resolveIssueAudio(historyIssue({ source_version_id: null, source_version_number: null }), track)).toBe('')
  })

  it('does not invent original identity for a same-cycle unbound legacy issue after source revisions', () => {
    const source = historySource(13, 3)
    const track = historyTrack({ source_versions: [historySource(11, 1), source] })
    const timed = historyIssue({ source_version_id: null, source_version_number: null })
    const general = { ...timed, markers: [] }
    expect(issueBelongsToCurrentVersion(timed, track)).toBe(false)
    expect(issueBelongsToCurrentVersion(general, track)).toBe(true)
    expect(issuesForSourceAudio([timed, general], source, track, true)).toEqual([])
    expect(resolveIssueAudio(timed, track)).toBe('')
    expect(resolveIssueAudio(general, track)).toBe('')
    const initialSource = historySource(11, 1)
    const initial = historyTrack({ version: 1, current_source_version: initialSource,
      source_versions: [initialSource], file_path: initialSource.file_path })
    expect(issueBelongsToCurrentVersion(timed, initial)).toBe(true)
    expect(resolveIssueAudio(timed, initial)).toBe(sourceVersionAudioUrl(9, initialSource))
    expect(issuesForSourceAudio([timed], initialSource, initial, true)).toEqual([timed])
  })

  it('labels protected master history using scalar provenance without exposing delivery history', () => {
    const track = historyTrack({ current_master_delivery: null, viewer_is_mastering_participant: false, viewer_can_access_master_audio: false })
    const issue = historyIssue({ master_delivery_id: 21, master_delivery_number: 7, master_delivery_workflow_cycle: 1 })
    expect(issueOriginLabel(issue, t, track)).toBe('Cycle 1 · Master v7')
    expect(resolveIssueAudio(issue, track, [], [historyMaster(21, 1, 7)])).toBe('')
    expect(issueOriginLabel({ ...issue, master_delivery_number: null, master_delivery_workflow_cycle: null }, t, track)).toBe('Master · Origin not recorded')
    expect(resolveIssueAudio({ ...issue, master_delivery_number: null }, track)).toBe('')
  })

  it('uses the actual historical master fallback delivery identity and cycle', () => {
    const delivery = historyMaster(21, 1, 7)
    const issue = historyIssue({ master_delivery_id: 21, workflow_cycle: 1, master_delivery_number: 7, master_delivery_workflow_cycle: 1 })
    const track = historyTrack({ current_master_delivery: delivery })
    expect(issuesForMasterAudio([issue, historyIssue({ id: 2, master_delivery_id: 22 })], delivery)).toEqual([issue])
    expect(issueOriginLabel(issue, t, track)).toBe('Cycle 1 · Master v7')
    expect(resolveIssueAudio(issue, track)).toBe(masterDeliveryAudioUrl(9, delivery))
    expect(issueBelongsToCurrentVersion({ ...issue, workflow_cycle: 2 }, track)).toBe(true)
  })

  it('shares the main and preview cache key for each exact current source and master file', () => {
    const track = historyTrack()
    expect(resolveIssueAudio(historyIssue(), track)).toBe(currentSourceAudioUrl(track, track.source_versions))
    expect(resolveIssueAudio(historyIssue({ master_delivery_id: 22 }), track)).toBe(masterDeliveryAudioUrl(9, historyMaster()))
    expect(currentSourceAudioUrl(historyTrack({ current_source_version: null, source_versions: [] }))).toContain('/audio?v=3')
    expect(resolveIssueAudio(historyIssue({ source_version_id: 99 }), track)).toBe('')
  })
  it('withdraws cached history eligibility when explicit master permissions are revoked', () => {
    const issue = historyIssue({ master_delivery_id: 21, master_delivery_number: 1, master_delivery_workflow_cycle: 1 })
    const track = historyTrack()
    expect(resolveIssueAudio(issue, track, [], [historyMaster(21, 1)])).toBe(masterDeliveryAudioUrl(9, historyMaster(21, 1)))
    expect(resolveIssueAudio(issue, { ...track, viewer_can_access_master_audio: false }, [], [historyMaster(21, 1)])).toBe('')
    expect(resolveIssueAudio(issue, { ...track, viewer_is_mastering_participant: false }, [], [historyMaster(21, 1)])).toBe('')
    expect(resolveIssueAudio({ ...issue, master_delivery_id: 22 }, { ...track, viewer_is_mastering_participant: false })).toBe(masterDeliveryAudioUrl(9, historyMaster()))
  })

  it('changes canonical keys when a source or delivery ID is reused for another record', () => {
    const source = historySource()
    const replacementSource = historySource(13, 3, { created_at: '2026-10-03T00:00:00Z' })
    expect(sourceVersionAudioUrl(9, source)).not.toBe(sourceVersionAudioUrl(9, replacementSource))
    expect(sourceVersionAudioUrl(9, source)).toContain('v=3&c=2&t=2026-10-02T00%3A00%3A00Z')
    const master = historyMaster()
    const replacementMaster = historyMaster(22, 2, 1, { created_at: '2026-10-03T00:00:00Z' })
    expect(masterDeliveryAudioUrl(9, master)).not.toBe(masterDeliveryAudioUrl(9, replacementMaster))
    expect(masterDeliveryAudioUrl(9, master)).toContain('v=1&c=2&t=2026-10-02T00%3A00%3A00Z')
  })

  it('does not borrow a previous track source for a current-cycle unbound issue', () => {
    expect(resolveIssueAudio(historyIssue({ track_id: 10, source_version_id: null, source_version_number: null }), historyTrack())).toBe('')
  })
})
