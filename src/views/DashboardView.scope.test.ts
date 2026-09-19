import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  tracks: vi.fn(), albums: vi.fn(), invitations: vi.fn(), store: null as any,
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/dashboard' }),
}))
vi.mock('@/api', () => ({
  API_ORIGIN: '', resolveUploadUrl: (url: string) => url,
  trackApi: { list: mocks.tracks }, albumApi: { list: mocks.albums },
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => mocks.store }))
vi.mock('@/components/workflow/StatusBadge.vue', () => ({ default: { template: '<span />' } }))

import DashboardView from './DashboardView.vue'

function track(id: number, albumId = 1, status = 'peer_review') {
  return {
    id, album_id: albumId, title: `Song ${id}`, artist: 'Artist', status,
    version: 1, updated_at: '2026-09-19T00:00:00Z', duration: 60,
    allowed_actions: ['open-step'], open_issue_count: 1,
  }
}
function album(id: number) {
  return { id, title: `Album ${id}`, genres: [], track_count: 1, open_issues: 1, by_status: { peer_review: 1 } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('Dashboard personal scope', () => {
  let wrapper: VueWrapper | undefined
  let userId = 100
  const mount = () => (wrapper = mountWithPlugins(DashboardView))
  const scopeButton = (index: number) => wrapper!.find('[role="group"]').findAll('button')[index]!
  const key = () => `backkitchen_dashboard_scope_${userId}`

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    userId++
    mocks.store = reactive({
      currentUser: { id: userId },
      pendingInvitations: [{ id: 1, album: { title: 'Personal invitation' } }],
      loadPendingInvitations: mocks.invitations,
    })
    mocks.invitations.mockResolvedValue(undefined)
    mocks.tracks.mockImplementation(async ({ status, album_scope }: any) => {
      if (status === 'rejected') return album_scope === 'all' ? [track(9, 2, 'rejected')] : []
      return album_scope === 'all' ? [track(1), track(2, 2)] : [track(1)]
    })
    mocks.albums.mockImplementation(async ({ scope }: any) => scope === 'all' ? [album(1), album(2)] : [album(1)])
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defaults to all and updates every dashboard section while keeping invitations', async () => {
    mount()
    await flushPromises()
    expect(scopeButton(0).attributes('aria-pressed')).toBe('true')
    expect(wrapper!.text()).toContain('Song 2')
    await scopeButton(1).trigger('click')
    await flushPromises()
    expect(mocks.tracks).toHaveBeenLastCalledWith(expect.objectContaining({ album_scope: 'managed', status: 'rejected' }))
    expect(mocks.albums).toHaveBeenLastCalledWith({ scope: 'managed', search: undefined })
    expect(wrapper!.text()).not.toContain('Song 2')
    expect(wrapper!.text()).not.toContain('Album 2')
    expect(wrapper!.text()).toContain('Personal invitation')
    const counts = wrapper!.find('.grid.grid-cols-3').findAll('button').map(button => button.find('.text-2xl').text())
    expect(counts).toEqual(['1', '0', '1', '0', '0', '0'])
    for (const label of ['Waiting For Me', 'Tracks Needing Attention', 'Recent Updates']) {
      const card = wrapper!.findAll('.card').find(card => card.find('h2').exists() && card.find('h2').text() === label)!
      expect(card.text()).toContain('Song 1')
      expect(card.text()).not.toContain('Song 2')
    }
    expect(wrapper!.find('tbody').text()).toContain('Song 1')
  })

  it('remembers the dashboard separately from album management and isolates accounts', async () => {
    localStorage.setItem(`backkitchen_album_scope_${userId}`, 'participating')
    localStorage.setItem(key(), 'managed')
    mount()
    await flushPromises()
    expect(scopeButton(1).attributes('aria-pressed')).toBe('true')
    await scopeButton(2).trigger('click')
    await flushPromises()
    expect(localStorage.getItem(key())).toBe('participating')
    expect(localStorage.getItem(`backkitchen_album_scope_${userId}`)).toBe('participating')
    await scopeButton(1).trigger('click')
    await flushPromises()
    expect(localStorage.getItem(`backkitchen_album_scope_${userId}`)).toBe('participating')
    wrapper!.unmount()
    mount()
    await flushPromises()
    expect(scopeButton(1).attributes('aria-pressed')).toBe('true')
    mocks.store.currentUser = { id: userId + 1000 }
    await flushPromises()
    expect(scopeButton(0).attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem(key())).toBe('managed')
    mocks.store.currentUser = { id: userId }
    await flushPromises()
    expect(scopeButton(1).attributes('aria-pressed')).toBe('true')
  })

  it('reloads on account changes even when both accounts select the same scope', async () => {
    const old = deferred<any[]>()
    mocks.albums.mockReturnValueOnce(old.promise)
    mount()
    mocks.store.currentUser = { id: userId + 1000 }
    await flushPromises()
    old.resolve([album(77)])
    await flushPromises()
    expect(mocks.albums).toHaveBeenCalledTimes(2)
    expect(wrapper!.text()).not.toContain('Album 77')
  })

  it('keeps search and status filters and pages with a captured scope', async () => {
    vi.useFakeTimers()
    mount()
    await flushPromises()
    await wrapper!.findAll('button').find(button => button.text().includes('Peer Flow'))!.trigger('click')
    await wrapper!.find('input').setValue('Needle')
    mocks.albums.mockResolvedValue([])
    mocks.tracks.mockImplementation(async ({ status, offset }: any) => {
      if (status === 'rejected') return []
      return offset === 0 ? Array.from({ length: 100 }, (_, i) => track(i + 100)) : [track(999)]
    })
    await scopeButton(2).trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(300)
    expect(mocks.tracks).toHaveBeenCalledWith(expect.objectContaining({ search: 'Needle', album_scope: 'participating', offset: 100 }))
    expect(mocks.albums).toHaveBeenLastCalledWith({ search: 'Needle', scope: 'participating' })
    expect(mocks.albums).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('tbody').text()).toContain('Song 100')
    expect(wrapper!.text()).toContain('filtered: Peer Flow')
  })

  it('intersects pinned albums with scope without filtering track statistics', async () => {
    localStorage.setItem(`backkitchen_dashboard_pins_${userId}`, '[2]')
    mount()
    await flushPromises()
    await wrapper!.findAll('button').find(button => button.text() === 'Pinned only')!.trigger('click')
    expect(wrapper!.findAll('h3').map(heading => heading.text())).toContain('Album 2')
    expect(wrapper!.findAll('h3').map(heading => heading.text())).not.toContain('Album 1')
    await scopeButton(1).trigger('click')
    await flushPromises()
    expect(wrapper!.findAll('h3').map(heading => heading.text())).not.toContain('Album 2')
    expect(wrapper!.findAll('h3').map(heading => heading.text())).not.toContain('Album 1')
    expect(wrapper!.find('tbody').text()).toContain('Song 1')
    expect(wrapper!.find('.grid.grid-cols-3 button .text-2xl').text()).toBe('1')
  })

  it('ignores late successes and failures after a newer scope finishes', async () => {
    mount()
    await flushPromises()
    const old = deferred<any[]>()
    const intermediate = deferred<any[]>()
    mocks.albums.mockImplementation(({ scope }: any) => scope === 'managed' ? old.promise : scope === 'participating' ? intermediate.promise : Promise.resolve([album(3)]))
    await scopeButton(1).trigger('click')
    await scopeButton(2).trigger('click')
    await scopeButton(0).trigger('click')
    await flushPromises()
    old.resolve([album(77)])
    intermediate.reject(new Error('stale'))
    await flushPromises()
    expect(wrapper!.text()).toContain('Album 3')
    expect(wrapper!.text()).not.toContain('Album 77')
    expect(wrapper!.findAll('button').some(button => button.text() === 'Retry')).toBe(false)
  })

  it('clears the previous scope on failure and retries the selected scope into an empty state', async () => {
    mount()
    await flushPromises()
    mocks.albums.mockRejectedValueOnce(new Error('failed'))
    await scopeButton(1).trigger('click')
    await flushPromises()
    expect(wrapper!.text()).not.toContain('Song 2')
    expect(wrapper!.text()).not.toContain('Album 2')
    mocks.albums.mockResolvedValue([])
    mocks.tracks.mockResolvedValue([])
    await wrapper!.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
    await flushPromises()
    expect(mocks.albums).toHaveBeenLastCalledWith({ search: undefined, scope: 'managed' })
    expect(wrapper!.text()).toContain('No tracks found.')
    expect(wrapper!.text()).toContain('Personal invitation')
  })

  it('tolerates invalid or unavailable browser storage', async () => {
    localStorage.setItem(key(), 'invalid')
    mount()
    await flushPromises()
    expect(scopeButton(0).attributes('aria-pressed')).toBe('true')
    wrapper!.unmount()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mount()
    await flushPromises()
    await scopeButton(1).trigger('click')
    await flushPromises()
    expect(scopeButton(1).attributes('aria-pressed')).toBe('true')
    expect(mocks.albums).toHaveBeenLastCalledWith({ search: undefined, scope: 'managed' })
  })
})
