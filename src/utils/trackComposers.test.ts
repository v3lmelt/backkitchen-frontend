import { describe, expect, it } from 'vitest'

import type { Track, User } from '@/types'

import { isTrackComposer, trackComposerDisplayText, trackComposerIds } from './trackComposers'

function makeUser(id: number, displayName: string): User {
  return {
    id,
    username: displayName.toLowerCase(),
    display_name: displayName,
    role: 'member',
    avatar_color: '#000000',
    is_admin: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    title: 'Track',
    artist: null,
    album_id: 1,
    file_path: '/audio.wav',
    duration: 120,
    bpm: null,
    original_title: null,
    original_artist: null,
    status: 'peer_review',
    rejection_mode: 'resubmittable',
    workflow_variant: 'standard',
    version: 1,
    workflow_cycle: 1,
    submitter_id: 10,
    composer_ids: [10],
    proxy_uploader_id: null,
    peer_reviewer_id: 20,
    producer_id: 30,
    mastering_engineer_id: 40,
    external_submitter_name: null,
    is_proxy_submission: false,
    author_notes: null,
    mastering_notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    submitter: makeUser(10, 'Primary'),
    composers: [makeUser(10, 'Primary')],
    current_source_version: null,
    current_master_delivery: null,
    pending_source_followup_request: null,
    allowed_actions: [],
    workflow_step: null,
    workflow_transitions: [],
    source_versions: [],
    is_public: false,
    ...overrides,
  } as Track
}

describe('trackComposers', () => {
  it('keeps the primary submitter first and dedupes collaborators', () => {
    const track = makeTrack({ composer_ids: [11, 10, 11] })

    expect(trackComposerIds(track)).toEqual([10, 11])
    expect(isTrackComposer(track, 11)).toBe(true)
    expect(isTrackComposer(track, 12)).toBe(false)
  })

  it('uses returned composer users for display text', () => {
    const track = makeTrack({
      composer_ids: [10, 11],
      composers: [makeUser(10, 'Primary'), makeUser(11, 'Co')],
    })

    expect(trackComposerDisplayText(track)).toBe('Primary / Co')
  })
})
