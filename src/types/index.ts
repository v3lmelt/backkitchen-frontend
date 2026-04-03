export type TrackStatus = 'submitted' | 'in_review' | 'revision' | 'approved'
export type IssueType = 'point' | 'range'
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion'
export type IssueStatus = 'open' | 'will_fix' | 'disagreed' | 'resolved'
export type UserRole = 'producer' | 'author' | 'reviewer'

export interface User {
  id: number
  username: string
  display_name: string
  role: UserRole
  avatar_color: string
  created_at: string
}

export interface Album {
  id: number
  title: string
  description: string | null
  cover_color: string
  created_at: string
  updated_at: string
  track_count: number
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
  version: number
  created_at: string
  updated_at: string
  issue_count?: number
  open_issue_count?: number
}

export interface Issue {
  id: number
  track_id: number
  author_id: number
  author?: User
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
  author?: User
  content: string
  created_at: string
  images?: CommentImage[]
}

export interface ChecklistItem {
  id: number
  track_id: number
  reviewer_id: number
  label: string
  passed: boolean
  note: string | null
  created_at: string
}

export interface DashboardStats {
  total_tracks: number
  in_review: number
  needs_revision: number
  approved: number
}
