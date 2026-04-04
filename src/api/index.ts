import type {
  Album,
  AuthResponse,
  ChecklistItem,
  Comment,
  Invitation,
  Issue,
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
  create: (data: { title: string; description?: string; cover_color?: string }) =>
    request<Album>('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: number, data: { mastering_engineer_id: number | null; member_ids: number[] }) =>
    request<Album>(`/albums/${id}/team`, { method: 'PATCH', body: JSON.stringify(data) }),
  tracks: (id: number) => request<Track[]>(`/albums/${id}/tracks`),
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
  update: (id: number, data: Partial<Pick<Issue, 'status' | 'title' | 'description' | 'severity'>>) =>
    request<Issue>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addComment: (id: number, data: { content: string; images?: File[] }) => {
    const form = new FormData()
    form.append('content', data.content)
    if (data.images) {
      for (const img of data.images) form.append('images', img)
    }
    return request<Comment>(`/issues/${id}/comments`, { method: 'POST', body: form })
  },
}

export const checklistApi = {
  get: (trackId: number) => request<ChecklistItem[]>(`/tracks/${trackId}/checklist`),
  submit: (trackId: number, items: { label: string; passed: boolean; note?: string }[]) =>
    request<ChecklistItem[]>(`/tracks/${trackId}/checklist`, { method: 'POST', body: JSON.stringify({ items }) }),
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
