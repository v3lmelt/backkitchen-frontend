import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  pushMock: vi.fn(),
  verifyEmailMock: vi.fn(),
  setAuthMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  authApi: { verifyEmail: mocks.verifyEmailMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ setAuth: mocks.setAuthMock }),
}))

import VerifyEmailView from './VerifyEmailView.vue'

describe('VerifyEmailView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.query = {}
    mocks.pushMock.mockReset()
    mocks.verifyEmailMock.mockReset()
    mocks.setAuthMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an error when the token is missing', async () => {
    const wrapper = mountWithPlugins(VerifyEmailView)
    await flushPromises()

    expect(wrapper.text()).toContain('Verification failed')
    expect(wrapper.text()).toContain('No verification token found in the URL.')
    expect(mocks.verifyEmailMock).not.toHaveBeenCalled()
  })

  it('verifies the email, stores auth, and redirects', async () => {
    mocks.query = { token: 'verify-token' }
    mocks.verifyEmailMock.mockResolvedValue({
      access_token: 'access-token',
      user: { id: 1, username: 'nova' },
    })

    const wrapper = mountWithPlugins(VerifyEmailView)
    await flushPromises()

    expect(mocks.verifyEmailMock).toHaveBeenCalledWith('verify-token')
    expect(mocks.setAuthMock).toHaveBeenCalledWith({ id: 1, username: 'nova' }, 'access-token')
    expect(wrapper.text()).toContain('Email verified!')

    vi.runAllTimers()
    expect(mocks.pushMock).toHaveBeenCalledWith('/')
  })

  it('renders the API error message on verification failure', async () => {
    mocks.query = { token: 'bad-token' }
    mocks.verifyEmailMock.mockRejectedValue(new Error('Expired link'))

    const wrapper = mountWithPlugins(VerifyEmailView)
    await flushPromises()

    expect(wrapper.text()).toContain('Verification failed')
    expect(wrapper.text()).toContain('Expired link')
  })
})
