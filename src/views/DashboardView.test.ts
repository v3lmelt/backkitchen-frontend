import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('DashboardView', () => {
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
          {
            id: 13,
            album_id: 1,
            title: 'Rejected Song',
            artist: 'Nova',
            status: 'rejected',
            duration: 63,
            version: 1,
            updated_at: '2024-01-03T00:00:00Z',
            allowed_actions: [],
            open_issue_count: 0,
          },
        ]
      }
      return [
        {
          id: 11,
          album_id: 1,
          title: 'Submitted Song',
          artist: 'Nova',
          status: 'submitted',
          duration: 61,
          version: 1,
          updated_at: '2024-01-01T00:00:00Z',
          allowed_actions: [],
          open_issue_count: 0,
          original_title: 'Bad Apple!!',
          original_artist: 'Touhou',
        },
        {
          id: 12,
          album_id: 1,
          title: 'Peer Song',
          artist: 'Nova',
          status: 'peer_review',
          duration: 62,
          version: 2,
          updated_at: '2024-01-02T00:00:00Z',
          allowed_actions: ['open-step'],
          open_issue_count: 1,
        },
      ]
    })
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Album One',
        producer_id: 1,
        track_count: 2,
        total_tracks: 2,
        by_status: { submitted: 1, peer_review: 1, completed: 1 },
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

    await wrapper.findAll('.card').find(node => node.text().includes('Peer Flow'))!.trigger('click')
    expect(wrapper.find('tbody').text()).toContain('Peer Song')
    expect(wrapper.find('tbody').text()).not.toContain('Submitted Song')

    await wrapper.findAll('.card').find(node => node.text().includes('Rejected'))!.trigger('click')
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
})
