import type { Album, Track, Issue, Comment, ChecklistItem, User, TrackStatus } from '@/types'

const BASE = '/api'

function parseErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
  }
  return ''
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(parseErrorDetail(body.detail) || `Request failed: ${res.status}`)
  }
  return res.json()
}

// Albums
export const albumApi = {
  list: () => request<Album[]>('/albums'),
  get: (id: number) => request<Album>(`/albums/${id}`),
  create: (data: { title: string; description?: string; cover_color?: string }) =>
    request<Album>('/albums', { method: 'POST', body: JSON.stringify(data) }),
  tracks: (id: number) => request<Track[]>(`/albums/${id}/tracks`),
}

// Tracks
export const trackApi = {
  list: (params?: { status?: TrackStatus; album_id?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.album_id) q.set('album_id', String(params.album_id))
    const qs = q.toString()
    return request<Track[]>(`/tracks${qs ? '?' + qs : ''}`)
  },
  get: (id: number) => request<Track>(`/tracks/${id}`),
  upload: async (formData: FormData) => {
    const res = await fetch(`${BASE}/tracks`, { method: 'POST', body: formData })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(parseErrorDetail(body.detail) || 'Upload failed')
    }
    return res.json() as Promise<Track>
  },
  updateStatus: (id: number, status: TrackStatus) =>
    request<Track>(`/tracks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  delete: (id: number) =>
    request<void>(`/tracks/${id}`, { method: 'DELETE' }),
}

// Issues
export const issueApi = {
  listForTrack: (trackId: number) => request<Issue[]>(`/tracks/${trackId}/issues`),
  get: (id: number) => request<Issue>(`/issues/${id}`),
  create: (trackId: number, data: Omit<Issue, 'id' | 'created_at' | 'updated_at' | 'comments' | 'comment_count' | 'author' | 'track_id'>) =>
    request<Issue>(`/tracks/${trackId}/issues`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Pick<Issue, 'status' | 'title' | 'description'>>) =>
    request<Issue>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addComment: (id: number, data: { author_id: number; content: string }) =>
    request<Comment>(`/issues/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
}

// Checklists
export const checklistApi = {
  get: (trackId: number) => request<ChecklistItem[]>(`/tracks/${trackId}/checklist`),
  submit: (trackId: number, items: { reviewer_id: number; label: string; passed: boolean; note?: string }[]) =>
    request<ChecklistItem[]>(`/tracks/${trackId}/checklist`, { method: 'POST', body: JSON.stringify(items) }),
}

// Users
export const userApi = {
  list: () => request<User[]>('/users'),
  get: (id: number) => request<User>(`/users/${id}`),
  create: (data: { username: string; display_name: string; role: string; avatar_color?: string }) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
}
