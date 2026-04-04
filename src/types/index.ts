export type TrackStatus =
  | 'submitted'
  | 'peer_review'
  | 'peer_revision'
  | 'producer_mastering_gate'
  | 'mastering'
  | 'mastering_revision'
  | 'final_review'
  | 'completed'
  | 'rejected'

export type RejectionMode = 'final' | 'resubmittable'
export type IssueType = 'point' | 'range'
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion'
export type IssueStatus = 'open' | 'will_fix' | 'disagreed' | 'resolved'
export type IssuePhase = 'peer' | 'mastering' | 'final_review'
export type UserRole = 'member' | 'producer' | 'mastering_engineer'

export interface User {
  id: number
  username: string
  display_name: string
  role: UserRole
  avatar_color: string
  email?: string
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface AlbumMember {
  id: number
  user_id: number
  created_at: string
  user: User
}

export interface Invitation {
  id: number
  album_id: number
  user_id: number
  invited_by_user_id: number
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  album?: { id: number; title: string; cover_color: string } | null
  user?: User | null
  invited_by_user?: User | null
}

export interface Album {
  id: number
  title: string
  description: string | null
  cover_color: string
  producer_id: number | null
  mastering_engineer_id: number | null
  producer?: User | null
  mastering_engineer?: User | null
  members: AlbumMember[]
  created_at: string
  updated_at: string
  track_count: number
}

export interface TrackSourceVersion {
  id: number
  workflow_cycle: number
  version_number: number
  file_path: string
  duration: number | null
  uploaded_by_id: number | null
  created_at: string
}

export interface MasterDelivery {
  id: number
  workflow_cycle: number
  delivery_number: number
  file_path: string
  uploaded_by_id: number | null
  producer_approved_at: string | null
  submitter_approved_at: string | null
  created_at: string
}

export interface Issue {
  id: number
  track_id: number
  author_id: number
  author?: User | null
  phase: IssuePhase
  workflow_cycle: number
  source_version_id: number | null
  master_delivery_id: number | null
  title: string
  description: string
  issue_type: IssueType
  severity: IssueSeverity
  status: IssueStatus
  time_start: number
  time_end: number | null
  created_at: string
  updated_at: string
  comment_count?: number
  comments?: Comment[]
}

export interface CommentImage {
  id: number
  comment_id: number
  image_url: string
  created_at: string
}

export interface Comment {
  id: number
  issue_id: number
  author_id: number
  author?: User | null
  content: string
  is_status_note: boolean
  created_at: string
  images?: CommentImage[]
}

export interface ChecklistItem {
  id: number
  track_id: number
  reviewer_id: number
  source_version_id: number | null
  workflow_cycle: number
  label: string
  passed: boolean
  note: string | null
  created_at: string
}

export interface WorkflowEvent {
  id: number
  event_type: string
  from_status: string | null
  to_status: string | null
  payload: Record<string, unknown> | null
  created_at: string
  actor?: User | null
}

export interface Track {
  id: number
  title: string
  artist: string
  album_id: number
  album_title?: string
  file_path: string | null
  duration: number | null
  bpm: number | null
  status: TrackStatus
  rejection_mode: RejectionMode | null
  version: number
  workflow_cycle: number
  submitter_id: number | null
  peer_reviewer_id: number | null
  producer_id: number | null
  mastering_engineer_id: number | null
  created_at: string
  updated_at: string
  issue_count?: number
  open_issue_count?: number
  submitter?: User | null
  peer_reviewer?: User | null
  current_source_version?: TrackSourceVersion | null
  current_master_delivery?: MasterDelivery | null
  allowed_actions: string[]
  source_versions?: TrackSourceVersion[]
}

export interface TrackDetailResponse {
  track: Track
  issues: Issue[]
  checklist_items: ChecklistItem[]
  events: WorkflowEvent[]
  source_versions?: TrackSourceVersion[]
}

export interface Notification {
  id: number
  user_id: number
  type: 'track_status_changed' | 'issue_created' | 'issue_status_changed' | 'comment_added' | 'track_assigned'
  title: string
  body: string
  related_track_id?: number
  related_issue_id?: number
  is_read: boolean
  created_at: string
}

export interface AlbumStats {
  total_tracks: number
  by_status: Partial<Record<TrackStatus, number>>
  open_issues: number
  recent_events: WorkflowEvent[]
}
