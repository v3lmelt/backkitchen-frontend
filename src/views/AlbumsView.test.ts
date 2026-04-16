import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  albumApi: { list: mocks.listMock },
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

describe('AlbumsView', () => {
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
})
