import type { Issue, MasterDelivery, Track, TrackDetailResponse, TrackSourceVersion } from '@/types'

export function historySource(id = 13, number = 3, overrides: Partial<TrackSourceVersion> = {}): TrackSourceVersion {
  return { id, version_number: number, workflow_cycle: 2, file_path: `/source-${id}.wav`, source_kind: 'file', duration: 4,
    uploaded_by_id: 2, revision_notes: null, created_at: '2026-10-02T00:00:00Z', ...overrides }
}

export function historyMaster(id = 22, cycle = 2, number = 1, overrides: Partial<MasterDelivery> = {}): MasterDelivery {
  return { id, workflow_cycle: cycle, delivery_number: number, file_path: `/master-${id}.wav`, delivery_kind: 'file',
    delivery_message: null, uploaded_by_id: 2, confirmed_at: null, producer_approved_at: null, submitter_approved_at: null,
    created_at: '2026-10-02T00:00:00Z', ...overrides }
}

export function historyIssue(overrides: Partial<Issue> = {}): Issue {
  return { id: 1, local_number: 1, track_id: 9, author_id: 2, phase: 'mastering', workflow_cycle: 2,
    source_version_id: 13, source_version_number: 3, master_delivery_id: null,
    title: 'Current issue', description: 'Original description at t:00:01', severity: 'major', status: 'open',
    markers: [{ id: 1, issue_id: 1, marker_type: 'point', time_start: 1, time_end: null }],
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', comments: [], ...overrides }
}

export function historyTrack(overrides: Partial<Track> = {}): Track {
  const source = historySource()
  return { id: 9, album_id: 5, title: 'History track', artist: 'Nova', status: 'mastering', workflow_variant: 'standard',
    version: 3, workflow_cycle: 2, rejection_mode: null, file_path: source.file_path, duration: 4, bpm: null,
    original_title: null, original_artist: null, author_notes: null, mastering_notes: null, archived_at: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', submitter_id: 3, producer_id: 8,
    peer_reviewer_id: 4, mastering_engineer_id: 2, viewer_is_mastering_participant: true, viewer_can_access_master_audio: true,
    current_source_version: source, current_master_delivery: historyMaster(), source_versions: [source],
    allowed_actions: [], is_public: false,
    workflow_step: { id: 'mastering', label: 'Mastering', type: 'delivery', ui_variant: 'mastering',
      assignee_role: 'mastering_engineer', order: 0, transitions: {} }, ...overrides }
}

export function historyDetail(issues: Issue[] = [historyIssue()], trackOverrides: Partial<Track> = {}): TrackDetailResponse {
  const sources = [historySource(11, 1, { workflow_cycle: 1, duration: 2 }), historySource(12, 2), historySource()]
  return { track: historyTrack({ source_versions: sources, ...trackOverrides }), issues, source_versions: sources,
    master_deliveries: [historyMaster(21, 1), historyMaster()], events: [], checklist_items: [], discussions: [] }
}
