import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listMock: vi.fn(),
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
    mocks.pushMock.mockReset()
    mocks.listMock.mockReset()
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
    expect(wrapper.text()).not.toContain('No Albums')

    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Albums failed to load')
    expect(wrapper.text()).toContain('No Albums')
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
    expect(mocks.listMock).toHaveBeenLastCalledWith({ search: 'nebula' })
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
    expect(mocks.listMock).toHaveBeenLastCalledWith({ archived_only: true, search: 'nebula' })

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
})
