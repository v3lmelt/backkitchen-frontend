import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/views/LoginView.vue', () => ({ default: { template: '<div>login</div>' } }))
vi.mock('@/views/RegisterView.vue', () => ({ default: { template: '<div>register</div>' } }))
vi.mock('@/views/DashboardView.vue', () => ({ default: { template: '<div>dashboard</div>' } }))
vi.mock('@/views/TrackDetailView.vue', () => ({ default: { template: '<div>track</div>' } }))
vi.mock('@/views/PeerReviewView.vue', () => ({ default: { template: '<div>peer</div>' } }))
vi.mock('@/views/IssueDetailView.vue', () => ({ default: { template: '<div>issue</div>' } }))
vi.mock('@/views/AuthorRevisionView.vue', () => ({ default: { template: '<div>revision</div>' } }))
vi.mock('@/views/ProducerDecisionView.vue', () => ({ default: { template: '<div>producer</div>' } }))
vi.mock('@/views/MasteringReviewView.vue', () => ({ default: { template: '<div>mastering</div>' } }))
vi.mock('@/views/FinalReviewView.vue', () => ({ default: { template: '<div>final</div>' } }))
vi.mock('@/views/UploadTrackView.vue', () => ({ default: { template: '<div>upload</div>' } }))
vi.mock('@/views/SettingsView.vue', () => ({ default: { template: '<div>settings</div>' } }))

describe('router guard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('redirects unauthenticated users to login', async () => {
    const { default: router } = await import('./index')
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('redirects authenticated users away from login', async () => {
    localStorage.setItem('backkitchen_token', 'token-1')
    const { default: router } = await import('./index')
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
