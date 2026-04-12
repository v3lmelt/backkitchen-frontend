import type {
  Album,
  AlbumStats,
  AppConfig,
  AuthResponse,
  ChecklistItem,
  ChecklistTemplateItem,
  ChecklistTemplateRead,
  Circle,
  CircleSummary,
  Comment,
  Discussion,
  EditHistory,
  ExportProgressEvent,
  Invitation,
  InviteCode,
  PresignedUploadResponse,
  ReopenRequest,
  StageAssignment,
  WebhookConfig,
  WebhookDelivery,
  WorkflowConfig,
  WorkflowEvent,
  WorkflowTemplate,
  Issue,
  IssueStatus,
  Notification,
  Track,
  TrackPlaybackPreference,
  TrackPlaybackPreferenceScope,
  TrackDetailResponse,
  TrackStatus,
  User,
  UserRole,
} from '@/types'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '') as string
const BASE = API_ORIGIN + '/api'
const TOKEN_KEY = 'backkitchen_token'

export { API_ORIGIN }

export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`
}

function parseErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((entry: any) => entry.msg || JSON.stringify(entry)).join('; ')
  }
  return ''
}

function authHeaders(headers?: HeadersInit): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY)
  return {
    ...(headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

type AuthClearedCallback = () => void
let _onAuthCleared: AuthClearedCallback | null = null

/** Register a callback invoked when stored credentials are wiped due to 401. */
export function onAuthCleared(cb: AuthClearedCallback) {
  _onAuthCleared = cb
}

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('backkitchen_user')
  _onAuthCleared?.()
}

let verifyPromise: Promise<boolean> | null = null

/**
 * Verify whether the currently-stored token is still accepted by the server.
 * Concurrent 401s share a single in-flight check. Returns `true` if the token
 * is valid (or the check itself could not run), `false` only when the server
 * confirms the token is no longer valid.
 */
async function verifyTokenStillValid(): Promise<boolean> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return false
  if (verifyPromise) return verifyPromise
  verifyPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.status !== 401
    } catch {
      // Network error — assume the token is still valid so we don't
      // log the user out on a flaky connection.
      return true
    } finally {
      verifyPromise = null
    }
  })()
  return verifyPromise
}

/**
 * Called when an endpoint responds with 401. We only wipe local credentials
 * when the failure is actually an auth/token problem — otherwise a single
 * unrelated 401 (or a transient backend bug) would force the user back to
 * /login mid-session.
 */
async function handleUnauthorized(url: string): Promise<void> {
  // /auth/me is the oracle itself — trust its verdict directly.
  if (url === '/auth/me' || url.startsWith('/auth/me?') || url.startsWith('/auth/me/')) {
    clearStoredAuth()
    return
  }
  // 401 from /auth/login means bad credentials on a fresh attempt,
  // not an expired session; leave stored auth (if any) alone.
  if (url.startsWith('/auth/login')) {
    return
  }
  const stillValid = await verifyTokenStillValid()
  if (!stillValid) {
    clearStoredAuth()
  }
}

export function uploadWithProgress<T>(
  url: string,
  body: FormData,
  onProgress?: (percent: number) => void,
  method: string = 'POST',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${BASE}${url}`)
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204) return resolve(undefined as T)
        resolve(JSON.parse(xhr.responseText))
      } else {
        if (xhr.status === 401) {
          // Fire-and-forget: the upload has already failed, we just need
          // to decide whether the session should be cleared.
          void handleUnauthorized(url)
        }
        let msg = `Request failed: ${xhr.status}`
        try {
          const parsed = JSON.parse(xhr.responseText)
          const detail = parseErrorDetail(parsed.detail)
          if (detail) msg = detail
        } catch {}
        reject(new Error(msg))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
    xhr.send(body)
  })
}

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 600

function isRetryable(status: number): boolean {
  return status >= 500 && status < 600
}

function shouldRetry(method: string | undefined): boolean {
  // Only retry idempotent methods to avoid duplicating side effects
  const m = (method ?? 'GET').toUpperCase()
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const headers: HeadersInit = isFormData
    ? authHeaders(options?.headers)
    : authHeaders({ 'Content-Type': 'application/json', ...options?.headers })

  const retryable = shouldRetry(options?.method)
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= (retryable ? MAX_RETRIES : 0); attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt))
    }
    try {
      const res = await fetch(`${BASE}${url}`, { ...options, headers })
      if (!res.ok) {
        // Retry on server errors for idempotent requests
        if (retryable && isRetryable(res.status) && attempt < MAX_RETRIES) {
          continue
        }
        const body = await res.json().catch(() => ({}))
        if (res.status === 401) {
          await handleUnauthorized(url)
        }
        throw new Error(parseErrorDetail(body.detail) || `Request failed: ${res.status}`)
      }
      if (res.status === 204) return undefined as T
      return res.json()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Retry on network errors for idempotent requests
      if (retryable && attempt < MAX_RETRIES && !(lastError.message.startsWith('Request failed'))) {
        continue
      }
      throw lastError
    }
  }
  throw lastError!
}

export const albumApi = {
  list: (params?: { include_archived?: boolean; archived_only?: boolean; search?: string }) => {
    const q = new URLSearchParams()
    if (params?.include_archived) q.set('include_archived', 'true')
    if (params?.archived_only) q.set('archived_only', 'true')
    if (params?.search) q.set('search', params.search)
    const qs = q.toString()
    return request<Album[]>(`/albums${qs ? `?${qs}` : ''}`)
  },
  get: (id: number) => request<Album>(`/albums/${id}`),
  archive: (id: number) =>
    request<Album>(`/albums/${id}/archive`, { method: 'POST' }),
  restore: (id: number) =>
    request<Album>(`/albums/${id}/restore`, { method: 'POST' }),
  create: (data: {
    title: string
    description?: string
    cover_color?: string
    release_date?: string | null
    catalog_number?: string | null
    circle_id?: number | null
    circle_name?: string | null
    genres?: string[] | null
    workflow_config?: WorkflowConfig | null
    workflow_template_id?: number | null
  }) =>
    request<Album>('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: number, data: { mastering_engineer_id: number | null; member_ids: number[] }) =>
    request<Album>(`/albums/${id}/team`, { method: 'PATCH', body: JSON.stringify(data) }),
  tracks: (id: number) => request<Track[]>(`/albums/${id}/tracks`),
  archivedTracks: (id: number) => request<Track[]>(`/albums/${id}/archived-tracks`),
  stats: (id: number) => request<AlbumStats>(`/albums/${id}/stats`),
  updateDeadlines: (id: number, data: { deadline?: string | null; phase_deadlines?: Record<string, string> | null }) =>
    request<Album>(`/albums/${id}/deadlines`, { method: 'PATCH', body: JSON.stringify(data) }),
  getWebhook: (id: number) =>
    request<WebhookConfig>(`/albums/${id}/webhook`),
  updateWebhook: (id: number, data: WebhookConfig) =>
    request<WebhookConfig>(`/albums/${id}/webhook`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  testWebhook: (id: number) =>
    request<{ success: boolean }>(`/albums/${id}/webhook/test`, { method: 'POST' }),
  getWebhookDeliveries: (id: number) =>
    request<WebhookDelivery[]>(`/albums/${id}/webhook/deliveries`),
  getWorkflow: (id: number) =>
    request<WorkflowConfig>(`/albums/${id}/workflow`),
  updateWorkflow: (id: number, config: WorkflowConfig) =>
    request<{ ok: boolean; migrations: Array<{ track_id: number; track_title: string; from_step: string; to_step: string }> }>(
      `/albums/${id}/workflow`, { method: 'PUT', body: JSON.stringify(config) },
    ),
  reorderTracks: (albumId: number, trackIds: number[]) =>
    request<Track[]>(`/albums/${albumId}/track-order`, {
      method: 'PATCH',
      body: JSON.stringify({ track_ids: trackIds }),
    }),
  updateMetadata: (id: number, data: {
    title?: string
    description?: string | null
    release_date?: string | null
    catalog_number?: string | null
    circle_name?: string | null
    genres?: string[] | null
  }) =>
    request<Album>(`/albums/${id}/metadata`, { method: 'PATCH', body: JSON.stringify(data) }),
  uploadCover: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Album>(`/albums/${id}/cover`, { method: 'POST', body: form })
  },
  removeMember: (albumId: number, userId: number) =>
    request<void>(`/albums/${albumId}/members/${userId}`, { method: 'DELETE' }),
  leaveAlbum: (albumId: number) =>
    request<void>(`/albums/${albumId}/leave`, { method: 'POST' }),
  activity: (id: number, params?: { event_type?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.event_type) q.set('event_type', params.event_type)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    const qs = q.toString()
    return request<WorkflowEvent[]>(`/albums/${id}/activity${qs ? `?${qs}` : ''}`)
  },
  exportStream: (id: number, onEvent: (event: ExportProgressEvent) => void): { cancel: () => void } => {
    const token = localStorage.getItem(TOKEN_KEY)
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/albums/${id}/export/stream`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          onEvent({ type: 'error', message: parseErrorDetail(body.detail) || `Export failed: ${res.status}` })
          return
        }
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                onEvent(JSON.parse(line.slice(6)))
              } catch { /* ignore malformed */ }
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        onEvent({ type: 'error', message: String(e) })
      }
    })()
    return { cancel: () => controller.abort() }
  },
  exportDownload: async (id: number, downloadId: string): Promise<Blob> => {
    const token = localStorage.getItem(TOKEN_KEY)
    const res = await fetch(`${BASE}/albums/${id}/export/download/${downloadId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(parseErrorDetail(body.detail) || `Download failed: ${res.status}`)
    }
    return res.blob()
  },
}

export const circleApi = {
  list: () => request<CircleSummary[]>('/circles'),
  get: (id: number) => request<Circle>(`/circles/${id}`),
  create: (data: { name: string; description?: string | null; website?: string | null }) =>
    request<Circle>('/circles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; description?: string | null; website?: string | null }) =>
    request<Circle>(`/circles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  uploadLogo: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Circle>(`/circles/${id}/logo`, { method: 'POST', body: form })
  },
  join: (code: string) =>
    request<CircleSummary>('/circles/join', { method: 'POST', body: JSON.stringify({ code }) }),
  leave: (circleId: number) =>
    request<void>(`/circles/${circleId}/leave`, { method: 'POST' }),
  delete: (circleId: number) =>
    request<void>(`/circles/${circleId}`, { method: 'DELETE' }),
  removeMember: (circleId: number, userId: number) =>
    request<void>(`/circles/${circleId}/members/${userId}`, { method: 'DELETE' }),
  listInviteCodes: (circleId: number) =>
    request<InviteCode[]>(`/circles/${circleId}/invite-codes`),
  createInviteCode: (circleId: number, data: { role?: string; expires_in_days?: number }) =>
    request<InviteCode>(`/circles/${circleId}/invite-codes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  revokeInviteCode: (circleId: number, codeId: number) =>
    request<void>(`/circles/${circleId}/invite-codes/${codeId}`, { method: 'DELETE' }),
  listWorkflowTemplates: (circleId: number) =>
    request<WorkflowTemplate[]>(`/circles/${circleId}/workflow-templates`),
  getWorkflowTemplate: (circleId: number, templateId: number) =>
    request<WorkflowTemplate>(`/circles/${circleId}/workflow-templates/${templateId}`),
  createWorkflowTemplate: (circleId: number, data: { name: string; description?: string | null; workflow_config: WorkflowConfig }) =>
    request<WorkflowTemplate>(`/circles/${circleId}/workflow-templates`, { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflowTemplate: (circleId: number, templateId: number, data: { name?: string; description?: string | null; workflow_config?: WorkflowConfig }) =>
    request<WorkflowTemplate>(`/circles/${circleId}/workflow-templates/${templateId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkflowTemplate: (circleId: number, templateId: number) =>
    request<void>(`/circles/${circleId}/workflow-templates/${templateId}`, { method: 'DELETE' }),
}

export const trackApi = {
  list: (params?: { status?: TrackStatus; album_id?: number; search?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.album_id) q.set('album_id', String(params.album_id))
    if (params?.search) q.set('search', params.search)
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    return request<Track[]>(`/tracks${qs ? `?${qs}` : ''}`)
  },
  get: (id: number) => request<TrackDetailResponse>(`/tracks/${id}`),
  upload: (formData: FormData) => request<Track>('/tracks', { method: 'POST', body: formData }),
  uploadSourceVersion: (id: number, file: File, revisionNotes?: string, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    if (revisionNotes) form.append('revision_notes', revisionNotes)
    return uploadWithProgress<Track>(`/tracks/${id}/source-versions`, form, onProgress)
  },
  uploadMasterDelivery: (id: number, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return uploadWithProgress<Track>(`/tracks/${id}/master-deliveries`, form, onProgress)
  },
  // Final-review approve is retained: the custom workflow engine delegates
  // to this endpoint for the producer+submitter dual-confirmation step.
  approveFinalReview: (id: number) =>
    request<Track>(`/tracks/${id}/final-review/approve`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/tracks/${id}`, { method: 'DELETE' }),
  archive: (id: number) => request<Track>(`/tracks/${id}/archive`, { method: 'POST' }),
  restore: (id: number) => request<Track>(`/tracks/${id}/restore`, { method: 'POST' }),
  workflowTransition: (id: number, decision: string) =>
    request<Track>(`/tracks/${id}/workflow/transition`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  // Stage assignments
  assignReviewer: (trackId: number, userIds: number[]) =>
    request<StageAssignment[]>(`/tracks/${trackId}/assign-reviewer`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
    }),
  listAssignments: (trackId: number) =>
    request<StageAssignment[]>(`/tracks/${trackId}/assignments`),
  reassignReviewer: (trackId: number, userIds?: number[]) =>
    request<Track>(`/tracks/${trackId}/reassign-reviewer`, {
      method: 'POST',
      body: JSON.stringify(userIds && userIds.length > 0 ? { user_ids: userIds } : { user_id: null }),
    }),
  // Delivery confirmation
  confirmDelivery: (trackId: number, deliveryId: number) =>
    request<Track>(`/tracks/${trackId}/master-deliveries/${deliveryId}/confirm`, { method: 'POST' }),
  // Track reopen
  requestReopen: (trackId: number, targetStageId: string, reason: string, masteringNotes?: string) =>
    request<ReopenRequest>(`/tracks/${trackId}/reopen-request`, {
      method: 'POST',
      body: JSON.stringify({ target_stage_id: targetStageId, reason, mastering_notes: masteringNotes || undefined }),
    }),
  reopen: (trackId: number, targetStageId: string) =>
    request<Track>(`/tracks/${trackId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ target_stage_id: targetStageId }),
    }),
  decideReopenRequest: (requestId: number, decision: 'approve' | 'reject') =>
    request<ReopenRequest>(`/tracks/reopen-requests/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  setVisibility: (trackId: number, isPublic: boolean) =>
    request<Track>(`/tracks/${trackId}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ is_public: isPublic }),
    }),
  updateMetadata: (trackId: number, data: {
    title?: string
    artist?: string
    bpm?: string | null
    original_title?: string | null
    original_artist?: string | null
  }) =>
    request<Track>(`/tracks/${trackId}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  updateAuthorNotes: (trackId: number, authorNotes: string | null) =>
    request<Track>(`/tracks/${trackId}/author-notes`, {
      method: 'PATCH',
      body: JSON.stringify({ author_notes: authorNotes }),
    }),
  updateMasteringNotes: (trackId: number, masteringNotes: string | null) =>
    request<Track>(`/tracks/${trackId}/mastering-notes`, {
      method: 'PATCH',
      body: JSON.stringify({ mastering_notes: masteringNotes }),
    }),
  getPlaybackPreference: (trackId: number, scope: TrackPlaybackPreferenceScope) =>
    request<TrackPlaybackPreference>(`/tracks/${trackId}/playback-preferences/${scope}`),
  setPlaybackPreference: (trackId: number, scope: TrackPlaybackPreferenceScope, data: { gain_db: number }) =>
    request<TrackPlaybackPreference>(`/tracks/${trackId}/playback-preferences/${scope}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

export const issueApi = {
  listForTrack: (trackId: number) => request<Issue[]>(`/tracks/${trackId}/issues`),
  get: (id: number) => request<Issue>(`/issues/${id}`),
  create: (trackId: number, data: {
    title: string
    description: string
    severity: string
    phase: string
    markers: { marker_type: string; time_start: number; time_end?: number | null }[]
    master_delivery_id?: number | null
    audios?: File[]
    images?: File[]
    visibility?: string
  }, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('title', data.title)
    form.append('description', data.description)
    form.append('severity', data.severity)
    form.append('phase', data.phase)
    form.append('markers_json', JSON.stringify(data.markers))
    if (data.visibility) {
      form.append('visibility', data.visibility)
    }
    if (data.master_delivery_id != null) {
      form.append('master_delivery_id', String(data.master_delivery_id))
    }
    if (data.audios) {
      for (const audio of data.audios) form.append('audios', audio)
    }
    if (data.images) {
      for (const image of data.images) form.append('images', image)
    }
    if (onProgress) {
      return uploadWithProgress<Issue>(`/tracks/${trackId}/issues`, form, onProgress)
    }
    return request<Issue>(`/tracks/${trackId}/issues`, { method: 'POST', body: form })
  },
  update: (
    id: number,
    data: Partial<Pick<Issue, 'status' | 'title' | 'description' | 'severity'>> & { status_note?: string; images?: File[]; audios?: File[] },
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData()
    if (data.status) form.append('status', data.status)
    if (data.title != null) form.append('title', data.title)
    if (data.description != null) form.append('description', data.description)
    if (data.severity) form.append('severity', data.severity)
    if (data.status_note) form.append('status_note', data.status_note)
    if (data.images) for (const img of data.images) form.append('images', img)
    if (data.audios) for (const audio of data.audios) form.append('audios', audio)
    if (onProgress && (data.images?.length || data.audios?.length)) {
      return uploadWithProgress<Issue>(`/issues/${id}`, form, onProgress, 'PATCH')
    }
    return request<Issue>(`/issues/${id}`, { method: 'PATCH', body: form })
  },
  batchUpdate: (trackId: number, data: { issue_ids: number[]; status: IssueStatus; status_note?: string }) =>
    request<Issue[]>(`/tracks/${trackId}/issues/batch`, { method: 'PATCH', body: JSON.stringify(data) }),
  addComment: (
    id: number,
    data: { content: string; images?: File[]; audios?: File[]; audioObjectKeys?: string[]; audioOriginalFilenames?: string[] },
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData()
    form.append('content', data.content)
    if (data.images) {
      for (const img of data.images) form.append('images', img)
    }
    if (data.audioObjectKeys?.length) {
      form.append('audio_object_keys', data.audioObjectKeys.join('\n'))
      if (data.audioOriginalFilenames?.length) {
        form.append('audio_original_filenames', data.audioOriginalFilenames.join('\n'))
      }
    } else if (data.audios) {
      for (const audio of data.audios) form.append('audios', audio)
    }
    if (onProgress) {
      return uploadWithProgress<Comment>(`/issues/${id}/comments`, form, onProgress)
    }
    return request<Comment>(`/issues/${id}/comments`, { method: 'POST', body: form })
  },
}

export const notificationApi = {
  list: (params?: { limit?: number; offset?: number }): Promise<Notification[]> => {
    const q = new URLSearchParams()
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    return request(`/notifications${qs ? `?${qs}` : ''}`)
  },
  markRead: (id: number): Promise<Notification> => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: (): Promise<{ updated: number }> => request('/notifications/read-all', { method: 'PATCH' }),
}

export const checklistApi = {
  get: (trackId: number) => request<ChecklistItem[]>(`/tracks/${trackId}/checklist`),
  submit: (trackId: number, items: { label: string; passed: boolean; note?: string }[]) =>
    request<ChecklistItem[]>(`/tracks/${trackId}/checklist`, { method: 'POST', body: JSON.stringify({ items }) }),
  getTemplate: (albumId: number) =>
    request<ChecklistTemplateRead>(`/albums/${albumId}/checklist-template`),
  updateTemplate: (albumId: number, items: ChecklistTemplateItem[]) =>
    request<ChecklistTemplateRead>(`/albums/${albumId}/checklist-template`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }),
  resetTemplate: (albumId: number) =>
    request<void>(`/albums/${albumId}/checklist-template`, {
      method: 'DELETE',
    }),
}

export const discussionApi = {
  list: (trackId: number) => request<Discussion[]>(`/tracks/${trackId}/discussions`),
  create: (trackId: number, data: { content: string; images?: File[] }, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('content', data.content)
    if (data.images) {
      for (const img of data.images) form.append('images', img)
    }
    if (onProgress && data.images?.length) {
      return uploadWithProgress<Discussion>(`/tracks/${trackId}/discussions`, form, onProgress)
    }
    return request<Discussion>(`/tracks/${trackId}/discussions`, { method: 'POST', body: form })
  },
  update: (id: number, content: string) =>
    request<Discussion>(`/discussions/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  delete: (id: number) =>
    request<void>(`/discussions/${id}`, { method: 'DELETE' }),
  history: (id: number) =>
    request<EditHistory[]>(`/discussions/${id}/history`),
}

export const commentApi = {
  update: (id: number, content: string) =>
    request<Comment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  delete: (id: number) =>
    request<void>(`/comments/${id}`, { method: 'DELETE' }),
  history: (id: number) =>
    request<EditHistory[]>(`/comments/${id}/history`),
}

export const userApi = {
  list: () => request<User[]>('/users'),
  get: (id: number) => request<User>(`/users/${id}`),
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: { username: string; email: string; password: string }) =>
    request<{ email: string; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ ...data, display_name: data.username }) }),
  verifyEmail: (token: string) =>
    request<AuthResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`, { method: 'POST' }),
  resendVerification: (email: string) =>
    request<void>(`/auth/resend-verification?email=${encodeURIComponent(email)}`, { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<void>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    request<AuthResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),
  me: () => request<User>('/auth/me'),
  updateProfile: (data: { display_name?: string; email?: string; feishu_contact?: string | null }) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<void>('/auth/me/change-password', { method: 'POST', body: JSON.stringify(data) }),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<User>('/auth/me/avatar', { method: 'POST', body: form })
  },
  deleteAvatar: () => request<User>('/auth/me/avatar', { method: 'DELETE' }),
  deleteAccount: (password: string) =>
    request<void>('/auth/me/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
}

export const adminApi = {
  listUsers: () => request<User[]>('/admin/users'),
  updateUser: (id: number, data: { role?: UserRole; is_admin?: boolean; email_verified?: boolean }) =>
    request<User>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: number) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
}

export const invitationApi = {
  listForAlbum: (albumId: number) => request<Invitation[]>(`/albums/${albumId}/invitations`),
  listMine: () => request<Invitation[]>('/invitations'),
  create: (albumId: number, userId: number) =>
    request<Invitation>(`/albums/${albumId}/invitations`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  accept: (id: number) => request<Invitation>(`/invitations/${id}/accept`, { method: 'POST' }),
  decline: (id: number) => request<void>(`/invitations/${id}/decline`, { method: 'POST' }),
  cancel: (id: number) => request<void>(`/invitations/${id}`, { method: 'DELETE' }),
}

export const configApi = {
  get: () => request<AppConfig>('/config'),
}

/**
 * Upload a file directly to R2 via a presigned PUT URL with progress tracking.
 */
export function uploadToR2(
  presignedUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.setRequestHeader('Cache-Control', 'public, max-age=2592000')

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('R2 upload network error')))
    xhr.addEventListener('abort', () => reject(new Error('R2 upload aborted')))
    xhr.send(file)
  })
}

export const r2Api = {
  // Track creation
  requestTrackUpload: (params: {
    filename: string
    content_type: string
    file_size: number
    album_id: number
    title: string
    artist: string
    bpm?: string | null
    original_title?: string | null
    original_artist?: string | null
    author_notes?: string | null
  }) => request<PresignedUploadResponse>('/tracks/request-upload', { method: 'POST', body: JSON.stringify(params) }),

  confirmTrackUpload: (params: {
    upload_id: string
    object_key: string
    duration?: number | null
    album_id: number
    title: string
    artist: string
    bpm?: string | null
    original_title?: string | null
    original_artist?: string | null
    author_notes?: string | null
  }) => request<Track>('/tracks/confirm-upload', { method: 'POST', body: JSON.stringify(params) }),

  // Source version
  requestSourceVersionUpload: (trackId: number, params: {
    filename: string
    content_type: string
    file_size: number
  }) => request<PresignedUploadResponse>(`/tracks/${trackId}/source-versions/request-upload`, { method: 'POST', body: JSON.stringify(params) }),

  confirmSourceVersionUpload: (trackId: number, params: {
    upload_id: string
    object_key: string
    duration?: number | null
    revision_notes?: string | null
  }) => request<Track>(`/tracks/${trackId}/source-versions/confirm-upload`, { method: 'POST', body: JSON.stringify(params) }),

  // Master delivery
  requestMasterDeliveryUpload: (trackId: number, params: {
    filename: string
    content_type: string
    file_size: number
  }) => request<PresignedUploadResponse>(`/tracks/${trackId}/master-deliveries/request-upload`, { method: 'POST', body: JSON.stringify(params) }),

  confirmMasterDeliveryUpload: (trackId: number, params: {
    upload_id: string
    object_key: string
    duration?: number | null
  }) => request<Track>(`/tracks/${trackId}/master-deliveries/confirm-upload`, { method: 'POST', body: JSON.stringify(params) }),

  // Comment audio
  requestCommentAudioUpload: (issueId: number, files: { filename: string; content_type: string; file_size: number }[]) =>
    request<{ uploads: PresignedUploadResponse[] }>(`/issues/${issueId}/comments/request-audio-upload`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
}
