import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listMock: vi.fn(),
  circleListMock: vi.fn(),
  currentUser: { id: 7, role: 'producer' },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  albumApi: {
    list: mocks.listMock,
  },
  circleApi: {
    list: mocks.circleListMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: mocks.currentUser,
  }),
}))

vi.mock('@/components/common/EmptyState.vue', () => ({
  default: {
    props: ['title', 'hint'],
    template: '<div class="empty-state">{{ title }} {{ hint }}</div>',
  },
}))

import AlbumsView from './AlbumsView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function albumFixture(id: number, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    description: null,
    cover_color: '#111111',
    cover_image: null,
    producer_id: 7,
    mastering_engineer_id: 3,
    members: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    archived_at: null,
    track_count: 2,
    is_completed: false,
    deadline: null,
    open_issues: 0,
    overdue_track_count: 0,
    ...overrides,
  }
}


describe('AlbumsView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    localStorage.clear()
    mocks.pushMock.mockReset()
    mocks.listMock.mockReset()
    mocks.circleListMock.mockReset()
    mocks.currentUser = { id: 7, role: 'producer' }
    mocks.circleListMock.mockResolvedValue([])
  })

  it('shows a retryable error state instead of the empty state when loading fails', async () => {
    mocks.listMock
      .mockRejectedValueOnce(new Error('Albums failed to load'))
      .mockResolvedValueOnce([])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Albums failed to load')
    expect(wrapper.text()).toContain('Retry')
    expect(wrapper.text()).not.toContain('No albums in progress')

    await wrapper.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Albums failed to load')
    expect(wrapper.text()).toContain('No albums in progress')
  })

  it('sorts active albums by attention level by default', async () => {
    mocks.listMock.mockResolvedValue([
      albumFixture(1, 'Calm Album'),
      albumFixture(2, 'Urgent Album', {
        cover_color: '#222222',
        mastering_engineer_id: 4,
        updated_at: '2024-01-02T00:00:00Z',
        deadline: '2024-01-01T00:00:00Z',
        open_issues: 3,
        overdue_track_count: 1,
      }),
    ])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    const titles = wrapper.findAll('h3').map(node => node.text())
    expect(titles[0]).toBe('Urgent Album')
    expect(titles[1]).toBe('Calm Album')
  })

  it('separates completed and archived albums and updates classification after reload', async () => {
    const completed = albumFixture(2, 'Finished Album', {
      is_completed: true, deadline: '2020-01-01T00:00:00Z', open_issues: 2,
    })
    const archived = albumFixture(3, 'Archived Album', {
      is_completed: true, archived_at: '2026-09-01T00:00:00Z',
    })
    mocks.listMock.mockImplementation(async ({ archived_only } = {}) =>
      archived_only ? [archived] : [albumFixture(1, 'Working Album'), completed],
    )
    const wrapper = mountWithPlugins(AlbumsView)
    const switchTab = async (label: string) => {
      await wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
      await flushPromises()
    }
    await flushPromises()
    expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['Working Album'])

    await switchTab('Completed')
    expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['Finished Album'])
    expect(wrapper.text()).not.toMatch(/overdue/i)
    expect(wrapper.find('.bg-success-bg').text()).toBe('Completed')
    expect(wrapper.find('span.bg-border.text-foreground').text()).toContain('2')

    await switchTab('Archived')
    expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['Archived Album'])
    expect(wrapper.find('.bg-success-bg').exists()).toBe(false)

    completed.is_completed = false
    await switchTab('Completed')
    expect(wrapper.text()).toContain('No completed albums')
    await switchTab('In Progress')
    expect(wrapper.findAll('h3').map(node => node.text())).toContain('Finished Album')
    expect(wrapper.text()).toMatch(/overdue/i)

    completed.is_completed = true
    await switchTab('Completed')
    expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['Finished Album'])
    wrapper.unmount()
  })

  it('searches within the completed tab while keeping active albums out', async () => {
    vi.useFakeTimers()
    mocks.listMock.mockResolvedValue([
      albumFixture(1, 'Nebula Draft'),
      albumFixture(2, 'Nebula Finished', { is_completed: true }),
    ])
    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === 'Completed')!.trigger('click')
    await wrapper.find('input.input-field').setValue('nebula')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: 'nebula', scope: 'all' })
    expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['Nebula Finished'])
    wrapper.unmount()
  })

  it('keeps manager-flagged circle albums visible with the co-producer role label', async () => {
    mocks.currentUser = { id: 42, role: 'member' }
    mocks.listMock.mockResolvedValue([
      albumFixture(3, 'Circle Managed Album', {
        producer_id: 1,
        mastering_engineer_id: 2,
        members: [{ id: 9, user_id: 3, user: { id: 3, display_name: 'Member' } }],
        viewer_is_album_manager: true,
        circle_name: 'Back Kitchen',
      }),
    ])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Circle Managed Album')
    expect(wrapper.text()).toContain('Co-producer')
    expect(wrapper.text()).not.toContain('No albums in progress')
  })

  it('shows the new album CTA for a co-producer when their managed circle has no albums yet', async () => {
    mocks.currentUser = { id: 42, role: 'member' }
    mocks.listMock.mockResolvedValue([])
    mocks.circleListMock.mockResolvedValue([
      {
        id: 9,
        name: 'Back Kitchen',
        description: null,
        logo_url: null,
        default_checklist_enabled: true,
        created_by: 1,
        member_count: 2,
        viewer_can_create_album: true,
      },
    ])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalled()
    expect(mocks.circleListMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('New Album')
    expect(wrapper.text()).toContain('No albums in progress')
    expect(wrapper.text()).toContain('Create an album or wait to join an existing one')
  })

  it('distinguishes missing-circle and invitation-only empty states', async () => {
    mocks.currentUser = { id: 42, role: 'member' }
    mocks.listMock.mockResolvedValue([])
    mocks.circleListMock.mockResolvedValue([])

    const withoutCircle = mountWithPlugins(AlbumsView)
    await flushPromises()
    expect(withoutCircle.text()).toContain('Create or join a circle first')
    withoutCircle.unmount()

    mocks.circleListMock.mockResolvedValue([
      {
        id: 9,
        name: 'Back Kitchen',
        description: null,
        logo_url: null,
        default_checklist_enabled: true,
        created_by: 1,
        member_count: 2,
        viewer_can_create_album: false,
      },
    ])
    const regularMember = mountWithPlugins(AlbumsView)
    await flushPromises()
    expect(regularMember.text()).toContain('Wait for an album manager to invite you')
    expect(regularMember.text()).not.toContain('New Album')
  })

  it('debounces album search requests', async () => {
    vi.useFakeTimers()
    mocks.listMock.mockResolvedValue([])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('nebula')
    await flushPromises()
    expect(mocks.listMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(299)
    expect(mocks.listMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(2)
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: 'nebula', scope: 'all' })
  })

  it('loads immediately on tab switch and cancels pending search debounce', async () => {
    vi.useFakeTimers()
    mocks.listMock.mockResolvedValue([])

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('nebula')
    await wrapper.findAll('button').find(button => button.text().includes('Archived'))!.trigger('click')
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(2)
    expect(mocks.listMock).toHaveBeenLastCalledWith({ archived_only: true, search: 'nebula', scope: 'all' })

    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(mocks.listMock).toHaveBeenCalledTimes(2)
  })

  it('ignores stale album search responses', async () => {
    vi.useFakeTimers()
    const oldSearch = deferred<any[]>()
    const newSearch = deferred<any[]>()

    mocks.listMock.mockImplementation(({ search }: { search?: string } = {}) => {
      if (!search) return Promise.resolve([])
      if (search === 'old') return oldSearch.promise
      if (search === 'new') return newSearch.promise
      return Promise.resolve([])
    })

    const wrapper = mountWithPlugins(AlbumsView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('old')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.find('input.input-field').setValue('new')
    await vi.advanceTimersByTimeAsync(300)

    newSearch.resolve([albumFixture(9, 'New Album')])
    await flushPromises()
    expect(wrapper.text()).toContain('New Album')

    oldSearch.resolve([albumFixture(8, 'Old Album')])
    await flushPromises()

    expect(wrapper.text()).toContain('New Album')
    expect(wrapper.text()).not.toContain('Old Album')
  })
  it('remembers the scope per account and combines it with archive filtering', async () => {
    mocks.listMock.mockResolvedValue([])
    const first = mountWithPlugins(AlbumsView)
    await flushPromises()
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: undefined, scope: 'all' })
    await first.findAll('button').find(button => button.text() === 'I manage')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('backkitchen_album_scope_7')).toBe('managed')
    first.unmount()
    const second = mountWithPlugins(AlbumsView)
    await flushPromises()
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: undefined, scope: 'managed' })
    await second.findAll('button').find(button => button.text().includes('Archived'))!.trigger('click')
    await flushPromises()
    expect(mocks.listMock).toHaveBeenLastCalledWith({ archived_only: true, search: undefined, scope: 'managed' })
    second.unmount()
    mocks.currentUser = { id: 8, role: 'producer' }
    const third = mountWithPlugins(AlbumsView)
    await flushPromises()
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: undefined, scope: 'all' })
    third.unmount()
  })

})
