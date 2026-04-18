/** Well-known legacy track statuses. Custom workflows may use arbitrary step IDs. */
export type LegacyTrackStatus =
  | 'submitted'
  | 'peer_review'
  | 'peer_revision'
  | 'producer_mastering_gate'
  | 'mastering'
  | 'mastering_revision'
  | 'final_review'
  | 'completed'
  | 'rejected'

/** Track status — can be a legacy status or any custom step ID. */
export type TrackStatus = LegacyTrackStatus | (string & {})

export type RejectionMode = 'final' | 'resubmittable'
export type MarkerType = 'point' | 'range'
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion'
export type IssueStatus = 'open' | 'pending_discussion' | 'internal_resolved' | 'disagreed' | 'resolved'
export type IssuePhase = string
export type UserRole = 'member' | 'producer'
export type AdminRole = 'none' | 'viewer' | 'operator' | 'superadmin'

export type WorkflowStepType = 'approval' | 'gate' | 'review' | 'revision' | 'delivery'
export type TrackPlaybackPreferenceScope = 'source' | 'master'

export type WorkflowUiVariant =
  | 'generic'
  | 'intake'
  | 'peer_review'
  | 'producer_gate'
  | 'mastering'
  | 'final_review'

export interface WorkflowStepDef {
  id: string
  label: string
  type: WorkflowStepType
  ui_variant?: WorkflowUiVariant | null
  assignee_role: string
  order: number
  transitions: Record<string, string>
  return_to?: string | null
  revision_step?: string | null
  // Approval-specific
  allow_permanent_reject?: boolean | null
  // Review-specific
  assignment_mode?: 'manual' | 'auto' | null
  reviewer_pool?: number[] | null
  required_reviewer_count?: number | null
  // Approval/delivery assignee override
  assignee_user_id?: number | null
  // Delivery-specific
  require_confirmation?: boolean | null
  // Additional roles that may act on this step
  actor_roles?: string[] | null
}

export interface WorkflowConfig {
  version: number
  steps: WorkflowStepDef[]
}

export interface WorkflowTransitionOption {
  decision: string
  label: string
}

export interface User {
  id: number
  username: string
  display_name: string
  role: UserRole
  avatar_color: string
  avatar_image?: string | null
  email?: string
  email_verified?: boolean
  feishu_contact?: string | null
  is_admin: boolean
  admin_role?: AdminRole
  suspended_at?: string | null
  suspension_reason?: string | null
  deleted_at?: string | null
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
  album?: { id: number; title: string; cover_color: string; cover_image?: string | null; circle_name?: string | null } | null
  user?: User | null
  invited_by_user?: User | null
}

export interface Album {
  id: number
  title: string
  description: string | null
  cover_color: string
  release_date?: string | null
  catalog_number?: string | null
  circle_id?: number | null
  circle_name?: string | null
  genres?: string[] | null
  cover_image?: string | null
  checklist_enabled?: boolean | null
  producer_id: number | null
  mastering_engineer_id: number | null
  deadline?: string | null
  phase_deadlines?: Record<string, string> | null
  workflow_config?: WorkflowConfig | null
  workflow_template_id?: number | null
  workflow_template_name?: string | null
  producer?: User | null
  mastering_engineer?: User | null
  members: AlbumMember[]
  created_at: string
  updated_at: string
  archived_at?: string | null
  track_count: number
  total_tracks?: number
  by_status?: Partial<Record<TrackStatus, number>>
  open_issues?: number
  recent_events?: WorkflowEvent[]
  overdue_track_count?: number
}

export interface CircleMember {
  id: number
  circle_id: number
  user_id: number
  role: 'owner' | 'member' | 'mastering_engineer'
  joined_at: string
  user: User
}

export interface Circle {
  id: number
  name: string
  description: string | null
  website: string | null
  logo_url: string | null
  default_checklist_enabled?: boolean
  created_by: number
  created_at: string
  members: CircleMember[]
}

export interface CircleSummary {
  id: number
  name: string
  description: string | null
  logo_url: string | null
  default_checklist_enabled?: boolean
  created_by: number
  member_count: number
}

export interface InviteCode {
  id: number
  circle_id: number
  code: string
  role: string
  expires_at: string
  is_active: boolean
  created_at: string
  created_by_user: User
}

export interface TrackSourceVersion {
  id: number
  workflow_cycle: number
  version_number: number
  file_path: string
  duration: number | null
  uploaded_by_id: number | null
  revision_notes: string | null
  created_at: string
}

export interface TrackPlaybackPreference {
  track_id: number
  user_id: number
  scope: TrackPlaybackPreferenceScope
  gain_db: number
  updated_at: string | null
}

export interface StageAssignment {
  id: number
  track_id: number
  stage_id: string
  user_id: number
  status: 'pending' | 'completed' | 'cancelled'
  decision?: string | null
  cancellation_reason?: string | null
  assigned_at: string
  completed_at: string | null
  user?: User | null
}

export interface ReopenRequest {
  id: number
  track_id: number
  requested_by_id: number
  target_stage_id: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  decided_by_id: number | null
  created_at: string
  decided_at: string | null
  requested_by?: User | null
  decided_by?: User | null
}

export interface MasterDelivery {
  id: number
  workflow_cycle: number
  delivery_number: number
  file_path: string
  uploaded_by_id: number | null
  confirmed_at: string | null
  producer_approved_at: string | null
  submitter_approved_at: string | null
  created_at: string
}

export interface IssueMarker {
  id: number
  issue_id: number
  marker_type: MarkerType
  time_start: number
  time_end: number | null
}

export interface IssueAudio {
  id: number
  issue_id: number
  audio_url: string
  original_filename: string
  duration: number | null
  created_at: string
}

export interface IssueImage {
  id: number
  issue_id: number
  image_url: string
  created_at: string
}

export interface Issue {
  id: number
  track_id: number
  local_number: number
  author_id: number
  author?: User | null
  phase: IssuePhase
  workflow_cycle: number
  source_version_id: number | null
  source_version_number?: number | null
  master_delivery_id: number | null
  title: string
  description: string
  severity: IssueSeverity
  status: IssueStatus
  markers: IssueMarker[]
  audios?: IssueAudio[]
  images?: IssueImage[]
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

export interface CommentAudio {
  id: number
  comment_id: number
  audio_url: string
  original_filename: string
  duration: number | null
  created_at: string
}

export interface Comment {
  id: number
  issue_id: number
  author_id: number
  author?: User | null
  content: string
  visibility?: 'public' | 'internal'
  is_status_note: boolean
  old_status?: IssueStatus | null
  new_status?: IssueStatus | null
  created_at: string
  edited_at?: string | null
  images?: CommentImage[]
  audios?: CommentAudio[]
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

export type WorkflowVariant = 'standard' | 'producer_direct'

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
  artist: string | null
  album_id: number
  album_title?: string
  album_checklist_enabled?: boolean | null
  file_path: string | null
  duration: number | null
  bpm: string | null
  original_title: string | null
  original_artist: string | null
  track_number?: number | null
  status: TrackStatus
  rejection_mode: RejectionMode | null
  workflow_variant: WorkflowVariant
  version: number
  workflow_cycle: number
  submitter_id: number | null
  peer_reviewer_id: number | null
  producer_id: number | null
  mastering_engineer_id: number | null
  author_notes: string | null
  mastering_notes: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  issue_count?: number
  open_issue_count?: number
  submitter?: User | null
  peer_reviewer?: User | null
  current_source_version?: TrackSourceVersion | null
  current_master_delivery?: MasterDelivery | null
  allowed_actions: string[]
  workflow_step?: WorkflowStepDef | null
  workflow_transitions?: WorkflowTransitionOption[] | null
  source_versions?: TrackSourceVersion[]
  is_public: boolean
}

export interface TrackDetailResponse {
  track: Track
  album?: Album | null
  issues: Issue[]
  checklist_items: ChecklistItem[]
  events: WorkflowEvent[]
  source_versions?: TrackSourceVersion[]
  master_deliveries?: MasterDelivery[]
  discussions?: Discussion[]
  workflow_config?: WorkflowConfig | null
}

export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  body: string
  related_track_id?: number
  related_issue_id?: number
  related_album_id?: number
  is_read: boolean
  created_at: string
}

export interface ChecklistTemplateItem {
  label: string
  description?: string | null
  required: boolean
  sort_order: number
}

export interface ChecklistTemplateRead {
  items: ChecklistTemplateItem[]
  is_default: boolean
}

export interface ChecklistDraftItem {
  label: string
  passed: boolean
  note?: string | null
}

export interface ChecklistDraftPrefillMeta {
  source_version_id?: number | null
  source_version_number?: number | null
  workflow_cycle?: number | null
  updated_at?: string | null
  confirmed_at?: string | null
  reconfirm_required?: boolean | null
  status?: string | null
  reason?: string | null
}

export interface ChecklistDraftRead {
  items: ChecklistDraftItem[]
  template_items: ChecklistTemplateItem[]
  prefill: ChecklistDraftPrefillMeta | null
}

export interface DiscussionImage {
  id: number
  discussion_id: number
  image_url: string
  created_at: string
}

export type DiscussionPhase = 'general' | 'mastering'

export interface DiscussionAudio {
  id: number
  discussion_id: number
  audio_url: string
  original_filename: string
  duration: number | null
  created_at: string
}

export interface Discussion {
  id: number
  track_id: number
  author_id: number
  visibility?: 'public' | 'internal'
  phase?: DiscussionPhase
  content: string
  created_at: string
  edited_at?: string | null
  author?: User | null
  images?: DiscussionImage[]
  audios?: DiscussionAudio[]
}

export interface EditHistory {
  id: number
  entity_type: 'comment' | 'discussion'
  entity_id: number
  old_content: string
  edited_by_id: number
  created_at: string
  editor?: User | null
}

export interface WorkflowTemplate {
  id: number
  circle_id: number
  name: string
  description: string | null
  workflow_config: WorkflowConfig
  created_by: number
  created_by_user?: User | null
  album_count: number
  created_at: string
  updated_at: string
}

export interface WebhookConfig {
  url: string
  enabled: boolean
  events: string[]
  type: string
  secret: string
  app_id: string
  app_secret: string
  filter_user_ids: number[]
}

export interface WebhookDelivery {
  id: number
  event_type: string
  success: boolean
  status_code: number | null
  target_url: string
  error_detail: string | null
  created_at: string
}

export interface AlbumStats {
  total_tracks: number
  by_status: Partial<Record<TrackStatus, number>>
  open_issues: number
  recent_events: WorkflowEvent[]
  deadline?: string | null
  overdue_track_count?: number
}

// R2 presigned upload types
export interface PresignedUploadResponse {
  upload_url: string
  object_key: string
  upload_id: string
  expires_in: number
}

export interface AppConfig {
  r2_enabled: boolean
}

export type ExportProgressEvent =
  | { type: 'start'; total: number }
  | { type: 'track_progress'; index: number; total: number; title: string; step: 'downloading' | 'reading' | 'metadata' }
  | { type: 'track_done'; index: number; total: number; title: string }
  | { type: 'track_skipped'; index: number; total: number; title: string }
  | { type: 'zipping'; total: number }
  | { type: 'complete'; download_id: string; total: number; processed: number }
  | { type: 'error'; message: string }

export interface AdminDashboardStats {
  total_users: number
  users_by_role: Record<string, number>
  total_albums: number
  active_albums: number
  archived_albums: number
  total_tracks: number
  tracks_by_status: Record<string, number>
  archived_tracks: number
  open_issues: number
  pending_reopen_requests: number
  failed_webhook_deliveries: number
  unverified_users: number
  suspended_users: number
  stalled_tracks: number
  recent_events: WorkflowEvent[]
  recent_audits: AdminAuditLogEntry[]
}

export interface AdminActivityLogEntry {
  id: number
  event_type: string
  from_status: string | null
  to_status: string | null
  payload: Record<string, unknown> | null
  created_at: string
  actor: User | null
  track_id: number | null
  track_title: string | null
  album_id: number | null
  album_title: string | null
}

export interface AdminAuditLogEntry {
  id: number
  action: string
  entity_type: string
  entity_id: number | null
  summary: string | null
  reason: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  target_user_id: number | null
  album_id: number | null
  track_id: number | null
  circle_id: number | null
  created_at: string
  actor: User | null
  target_user: User | null
}

export interface AdminReopenRequestEntry {
  id: number
  track_id: number
  track_title: string | null
  album_id: number | null
  album_title: string | null
  requested_by_id: number
  target_stage_id: string
  reason: string
  mastering_notes?: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_by_id: number | null
  created_at: string
  decided_at: string | null
  requested_by?: User | null
  decided_by?: User | null
}
