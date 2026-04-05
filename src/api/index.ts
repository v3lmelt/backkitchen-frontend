import type {
  Album,
  AlbumStats,
  AuthResponse,
  ChecklistItem,
  ChecklistTemplateItem,
  ChecklistTemplateRead,
  Comment,
  Discussion,
  Invitation,
  WebhookConfig,
  Issue,
  IssueStatus,
  Notification,
  Track,
  TrackDetailResponse,
  TrackStatus,
  User,
} from '@/types'

const BASE = '/api'
const TOKEN_KEY = 'backkitchen_token'

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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const headers: HeadersInit = isFormData
    ? authHeaders(options?.headers)
    : authHeaders({ 'Content-Type': 'application/json', ...options?.headers })

  const res = await fetch(`${BASE}${url}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('backkitchen_user')
    }
    throw new Error(parseErrorDetail(body.detail) || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const albumApi = {
  list: () => request<Album[]>('/albums'),
  get: (id: number) => request<Album>(`/albums/${id}`),
  create: (data: {
    title: string
    description?: string
    cover_color?: string
    release_date?: string | null
    catalog_number?: string | null
    circle_name?: string | null
    genres?: string[] | null
  }) =>
    request<Album>('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: number, data: { mastering_engineer_id: number | null; member_ids: number[] }) =>
    request<Album>(`/albums/${id}/team`, { method: 'PATCH', body: JSON.stringify(data) }),
  tracks: (id: number) => request<Track[]>(`/albums/${id}/tracks`),
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
  reorderTracks: (albumId: number, trackIds: number[]) =>
    request<Track[]>(`/albums/${albumId}/track-order`, {
      method: 'PATCH',
      body: JSON.stringify({ track_ids: trackIds }),
    }),
  updateMetadata: (id: number, data: {
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
  export: async (id: number): Promise<Blob> => {
    const token = localStorage.getItem(TOKEN_KEY)
    const res = await fetch(`${BASE}/albums/${id}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(parseErrorDetail(body.detail) || `Export failed: ${res.status}`)
    }
    return res.blob()
  },
}

export const trackApi = {
  list: (params?: { status?: TrackStatus; album_id?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.album_id) q.set('album_id', String(params.album_id))
    const qs = q.toString()
    return request<Track[]>(`/tracks${qs ? `?${qs}` : ''}`)
  },
  get: (id: number) => request<TrackDetailResponse>(`/tracks/${id}`),
  upload: (formData: FormData) => request<Track>('/tracks', { method: 'POST', body: formData }),
  uploadSourceVersion: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Track>(`/tracks/${id}/source-versions`, { method: 'POST', body: form })
  },
  intakeDecision: (id: number, decision: 'accept' | 'reject_final' | 'reject_resubmittable') =>
    request<Track>(`/tracks/${id}/intake-decision`, { method: 'POST', body: JSON.stringify({ decision }) }),
  finishPeerReview: (id: number, decision: 'needs_revision' | 'pass') =>
    request<Track>(`/tracks/${id}/peer-review/finish`, { method: 'POST', body: JSON.stringify({ decision }) }),
  producerGate: (id: number, decision: 'send_to_mastering' | 'request_peer_revision') =>
    request<Track>(`/tracks/${id}/producer-gate`, { method: 'POST', body: JSON.stringify({ decision }) }),
  requestMasteringRevision: (id: number) =>
    request<Track>(`/tracks/${id}/mastering/request-revision`, { method: 'POST' }),
  uploadMasterDelivery: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Track>(`/tracks/${id}/master-deliveries`, { method: 'POST', body: form })
  },
  approveFinalReview: (id: number) =>
    request<Track>(`/tracks/${id}/final-review/approve`, { method: 'POST' }),
  returnToMastering: (id: number) =>
    request<Track>(`/tracks/${id}/final-review/return`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/tracks/${id}`, { method: 'DELETE' }),
}

export const issueApi = {
  listForTrack: (trackId: number) => request<Issue[]>(`/tracks/${trackId}/issues`),
  get: (id: number) => request<Issue>(`/issues/${id}`),
  create: (trackId: number, data: Omit<Issue, 'id' | 'track_id' | 'author_id' | 'author' | 'workflow_cycle' | 'source_version_id' | 'master_delivery_id' | 'status' | 'created_at' | 'updated_at' | 'comment_count' | 'comments'>) =>
    request<Issue>(`/tracks/${trackId}/issues`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Pick<Issue, 'status' | 'title' | 'description' | 'severity'>> & { status_note?: string }) =>
    request<Issue>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  batchUpdate: (trackId: number, data: { issue_ids: number[]; status: IssueStatus; status_note?: string }) =>
    request<Issue[]>(`/tracks/${trackId}/issues/batch`, { method: 'PATCH', body: JSON.stringify(data) }),
  addComment: (id: number, data: { content: string; images?: File[]; audios?: File[] }) => {
    const form = new FormData()
    form.append('content', data.content)
    if (data.images) {
      for (const img of data.images) form.append('images', img)
    }
    if (data.audios) {
      for (const audio of data.audios) form.append('audios', audio)
    }
    return request<Comment>(`/issues/${id}/comments`, { method: 'POST', body: form })
  },
}

export const notificationApi = {
  list: (): Promise<Notification[]> => request('/notifications'),
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
  create: (trackId: number, data: { content: string; images?: File[] }) => {
    const form = new FormData()
    form.append('content', data.content)
    if (data.images) {
      for (const img of data.images) form.append('images', img)
    }
    return request<Discussion>(`/tracks/${trackId}/discussions`, { method: 'POST', body: form })
  },
}

export const userApi = {
  list: () => request<User[]>('/users'),
  get: (id: number) => request<User>(`/users/${id}`),
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: { username: string; display_name: string; email: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<User>('/auth/me'),
  updateProfile: (data: { display_name?: string; email?: string }) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<void>('/auth/me/change-password', { method: 'POST', body: JSON.stringify(data) }),
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
