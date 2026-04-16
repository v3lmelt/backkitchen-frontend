import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  listMock: vi.fn(),
  joinMock: vi.fn(),
  currentUser: { id: 3, role: 'producer' },
}))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  circleApi: {
    list: mocks.listMock,
    join: mocks.joinMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: mocks.currentUser,
  }),
}))

vi.mock('@/components/common/BaseModal.vue', () => ({
  default: {
    template: '<div><slot /></div>',
  },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: {
    template: '<div class="skeleton-loader" />',
  },
}))

import CirclesView from './CirclesView.vue'

describe('CirclesView', () => {
  beforeEach(() => {
    mocks.listMock.mockReset()
    mocks.joinMock.mockReset()
  })

  it('shows a retryable error state instead of the empty state when loading fails', async () => {
    mocks.listMock
      .mockRejectedValueOnce(new Error('Circles failed to load'))
      .mockResolvedValueOnce([])

    const wrapper = mountWithPlugins(CirclesView)
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Circles failed to load')
    expect(wrapper.text()).toContain('Retry')
    expect(wrapper.text()).not.toContain('No circles yet')

    await wrapper.findAll('button').find(button => button.text().includes('Retry'))!.trigger('click')
    await flushPromises()

    expect(mocks.listMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Circles failed to load')
    expect(wrapper.text()).toContain('No circles yet')
  })
})
