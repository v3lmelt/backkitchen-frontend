import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackListMock: vi.fn(),
  albumListMock: vi.fn(),
  albumExportStreamMock: vi.fn(),
  albumExportDownloadMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  declineInvitationMock: vi.fn(),
  loadPendingInvitationsMock: vi.fn(),
  pendingInvitations: [] as any[],
  currentUser: { id: 1 },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  useRoute: () => ({ fullPath: '/dashboard', path: '/dashboard' }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: { list: mocks.trackListMock },
  albumApi: {
    list: mocks.albumListMock,
    exportStream: mocks.albumExportStreamMock,
    exportDownload: mocks.albumExportDownloadMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: mocks.currentUser,
    pendingInvitations: mocks.pendingInvitations,
    loadPendingInvitations: mocks.loadPendingInvitationsMock,
    acceptInvitation: mocks.acceptInvitationMock,
    declineInvitation: mocks.declineInvitationMock,
  }),
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<span class="status-badge" />' },
}))

import DashboardView from './DashboardView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function trackFixture(id: number, title: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    album_id: 1,
    title,
    artist: 'Nova',
    status,
    duration: 60 + id,
    version: 1,
    updated_at: `2024-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    allowed_actions: [],
    open_issue_count: 0,
    workflow_step: { id: status, label: status },
    ...overrides,
  }
}


describe('DashboardView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackListMock.mockReset()
    mocks.albumListMock.mockReset()
    mocks.albumExportStreamMock.mockReset()
    mocks.albumExportDownloadMock.mockReset()
    mocks.acceptInvitationMock.mockReset()
    mocks.declineInvitationMock.mockReset()
    mocks.loadPendingInvitationsMock.mockReset()
    mocks.pendingInvitations = [
      {
        id: 31,
        album: { title: 'Invite Album', cover_image: null },
        invited_by_user: { display_name: 'Producer' },
      },
    ]
    mocks.trackListMock.mockImplementation(async ({ status }: { status?: string } = {}) => {
      if (status === 'rejected') {
        return [
          trackFixture(13, 'Rejected Song', 'rejected', {
            duration: 63,
            updated_at: '2024-01-03T00:00:00Z',
          }),
        ]
      }
      return [
        trackFixture(11, 'Submitted Song', 'submitted', {
          duration: 61,
          updated_at: '2024-01-01T00:00:00Z',
          original_title: 'Bad Apple!!',
          original_artist: 'Touhou',
          workflow_step: { id: 'submitted', label: 'Submitted' },
        }),
        trackFixture(12, 'Peer Song', 'peer_review', {
          duration: 62,
          version: 2,
          updated_at: '2024-01-02T00:00:00Z',
          allowed_actions: ['open-step'],
          open_issue_count: 1,
          workflow_step: { id: 'peer_review', label: 'Peer Review' },
        }),
        trackFixture(14, 'Peer Revision Song', 'peer_revision', {
          workflow_step: { id: 'peer_revision', label: 'Peer Revision' },
        }),
        trackFixture(15, 'Mastering Revision Song', 'mastering_revision', {
          workflow_step: { id: 'mastering_revision', label: 'Mastering Revision' },
        }),
        trackFixture(16, 'Final Review Song', 'final_review', {
          workflow_step: { id: 'final_review', label: 'Final Review' },
        }),
      ]
    })
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Album One',
        producer_id: 1,
        track_count: 5,
        total_tracks: 5,
        by_status: { submitted: 1, peer_review: 1, peer_revision: 1, mastering_revision: 1, final_review: 1, completed: 1 },
        open_issues: 1,
        overdue_track_count: 0,
        recent_events: [],
        deadline: null,
        genres: ['Trance'],
        catalog_number: 'BK-001',
        circle_name: 'Back Kitchen',
        cover_image: null,
      },
    ])
    mocks.albumExportDownloadMock.mockResolvedValue(new Blob(['zip']))
    mocks.albumExportStreamMock.mockImplementation((_albumId: number, onEvent: (event: any) => Promise<void> | void) => {
      void (async () => {
        await onEvent({ type: 'start', total: 1 })
        await onEvent({ type: 'complete', total: 1, processed: 1, download_id: 'dl-1' })
      })()
      return { cancel: vi.fn() }
    })
    mocks.acceptInvitationMock.mockResolvedValue(undefined)
    mocks.declineInvitationMock.mockResolvedValue(undefined)
    mocks.loadPendingInvitationsMock.mockResolvedValue(undefined)
  })

  it('loads dashboard data and filters tracks by status', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    expect(mocks.trackListMock).toHaveBeenCalledTimes(2)
    expect(mocks.albumListMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Submitted Song')
    expect(wrapper.text()).toContain('Peer Song')
    expect(wrapper.text()).not.toContain('Rejected Song')
    expect(wrapper.text()).toContain('Original Song: Bad Apple!!')
    expect(wrapper.text()).toContain('Original Source: Touhou')

    await wrapper.findAll('button').find(node => node.text().includes('Peer Flow'))!.trigger('click')
    expect(wrapper.find('tbody').text()).toContain('Peer Song')
    expect(wrapper.find('tbody').text()).toContain('Peer Revision Song')
    expect(wrapper.find('tbody').text()).not.toContain('Submitted Song')
    expect(wrapper.findAll('h2').find(heading => heading.text().includes('filtered'))!.text()).toContain('filtered: Peer Flow')

    await wrapper.findAll('button').find(node => node.text().includes('Mastering Flow'))!.trigger('click')
    expect(wrapper.find('tbody').text()).toContain('Mastering Revision Song')
    expect(wrapper.find('tbody').text()).toContain('Final Review Song')
    expect(wrapper.find('tbody').text()).not.toContain('Peer Song')
    expect(wrapper.findAll('h2').find(heading => heading.text().includes('filtered'))!.text()).toContain('filtered: Mastering Flow')

    await wrapper.findAll('button').find(node => node.text().includes('Rejected'))!.trigger('click')
    expect(wrapper.find('tbody').text()).toContain('Rejected Song')
    expect(wrapper.find('tbody').text()).not.toContain('Peer Song')
  })

  it('handles invitation actions and album export', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    const removeSpy = vi.spyOn(document.body, 'removeChild')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    const invitationButtons = wrapper.findAll('button').filter(button => ['Accept', 'Decline'].includes(button.text()))
    await invitationButtons[0].trigger('click')
    await invitationButtons[1].trigger('click')
    await flushPromises()

    expect(mocks.acceptInvitationMock).toHaveBeenCalledWith(31)
    expect(mocks.declineInvitationMock).toHaveBeenCalledWith(31)

    const exportButton = wrapper.findAll('button').find(button => button.text().includes('/'))
    await exportButton!.trigger('click')
    await flushPromises()

    expect(mocks.albumExportStreamMock).toHaveBeenCalledWith(1, expect.any(Function))
    expect(mocks.albumExportDownloadMock).toHaveBeenCalledWith(1, 'dl-1')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(appendSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()

    clickSpy.mockRestore()
    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('opens album settings when an album card is clicked', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    await wrapper.findAll('div').find(node => node.text().includes('Album One') && node.classes().includes('cursor-pointer'))!.trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith('/albums/1/settings')
  })

  it('opens waiting-for-me tracks directly in the workflow workspace', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('Peer Song'))!.trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/12/step/peer_review',
      query: { returnTo: '/dashboard' },
    })
  })

  it('opens recent tracks without actions on the track detail page', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('Submitted Song'))!.trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/11',
      query: { returnTo: '/dashboard' },
    })
  })

  it('opens actionable tracks from dashboard list rows in the workflow workspace', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    await wrapper.findAll('tbody tr').find(row => row.text().includes('Peer Song'))!.trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/12/step/peer_review',
      query: { returnTo: '/dashboard' },
    })

    mocks.pushMock.mockClear()

    await wrapper.findAll('div').find(node =>
      node.text().includes('Peer Song')
      && node.classes().includes('p-3')
      && node.classes().includes('cursor-pointer'),
    )!.trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/12/step/peer_review',
      query: { returnTo: '/dashboard' },
    })
  })

  it('ignores stale dashboard search responses', async () => {
    vi.useFakeTimers()
    const oldTracks = deferred<any[]>()
    const oldRejectedTracks = deferred<any[]>()
    const oldAlbums = deferred<any[]>()
    const newTracks = deferred<any[]>()
    const newRejectedTracks = deferred<any[]>()
    const newAlbums = deferred<any[]>()

    mocks.trackListMock.mockImplementation(({ status, search }: { status?: string; search?: string } = {}) => {
      if (!search) return Promise.resolve([])
      if (search === 'old') return status === 'rejected' ? oldRejectedTracks.promise : oldTracks.promise
      if (search === 'new') return status === 'rejected' ? newRejectedTracks.promise : newTracks.promise
      return Promise.resolve([])
    })
    mocks.albumListMock.mockImplementation(({ search }: { search?: string } = {}) => {
      if (!search) return Promise.resolve([])
      if (search === 'old') return oldAlbums.promise
      if (search === 'new') return newAlbums.promise
      return Promise.resolve([])
    })

    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('old')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.find('input[type="text"]').setValue('new')
    await vi.advanceTimersByTimeAsync(300)

    newTracks.resolve([trackFixture(21, 'New Search Song', 'submitted')])
    newRejectedTracks.resolve([])
    newAlbums.resolve([])
    await flushPromises()

    expect(wrapper.text()).toContain('New Search Song')

    oldTracks.resolve([trackFixture(22, 'Old Search Song', 'submitted')])
    oldRejectedTracks.resolve([])
    oldAlbums.resolve([])
    await flushPromises()

    expect(wrapper.text()).toContain('New Search Song')
    expect(wrapper.text()).not.toContain('Old Search Song')
  })
})
