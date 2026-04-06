import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackListMock: vi.fn(),
  albumListMock: vi.fn(),
  albumStatsMock: vi.fn(),
  albumExportMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  declineInvitationMock: vi.fn(),
  loadPendingInvitationsMock: vi.fn(),
  pendingInvitations: [] as any[],
  currentUser: { id: 1 },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  trackApi: { list: mocks.trackListMock },
  albumApi: {
    list: mocks.albumListMock,
    stats: mocks.albumStatsMock,
    export: mocks.albumExportMock,
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
    mocks.albumStatsMock.mockReset()
    mocks.albumExportMock.mockReset()
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
    mocks.trackListMock.mockResolvedValue([
      { id: 11, album_id: 1, title: 'Submitted Song', artist: 'Nova', status: 'submitted', duration: 61, version: 1, open_issue_count: 0 },
      { id: 12, album_id: 1, title: 'Peer Song', artist: 'Nova', status: 'peer_review', duration: 62, version: 2, open_issue_count: 1 },
    ])
    mocks.albumListMock.mockResolvedValue([
      { id: 1, title: 'Album One', producer_id: 1, track_count: 2, genres: ['Trance'], catalog_number: 'BK-001', circle_name: 'Back Kitchen', cover_image: null },
    ])
    mocks.albumStatsMock.mockResolvedValue({
      total_tracks: 2,
      by_status: { submitted: 1, peer_review: 1, completed: 1 },
      open_issues: 1,
      overdue_track_count: 0,
      recent_events: [],
      deadline: null,
    })
    mocks.albumExportMock.mockResolvedValue(new Blob(['zip']))
    mocks.acceptInvitationMock.mockResolvedValue(undefined)
    mocks.declineInvitationMock.mockResolvedValue(undefined)
    mocks.loadPendingInvitationsMock.mockResolvedValue(undefined)
  })

  it('loads dashboard data and filters tracks by status', async () => {
    const wrapper = mountWithPlugins(DashboardView)
    await flushPromises()

    expect(mocks.trackListMock).toHaveBeenCalledTimes(1)
    expect(mocks.albumListMock).toHaveBeenCalledTimes(1)
    expect(mocks.albumStatsMock).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('Submitted Song')
    expect(wrapper.text()).toContain('Peer Song')

    await wrapper.findAll('.card.cursor-pointer').at(2)!.trigger('click')
    expect(wrapper.text()).toContain('Peer Song')
    expect(wrapper.text()).not.toContain('Submitted Song')
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

    expect(mocks.albumExportMock).toHaveBeenCalledWith(1)
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
