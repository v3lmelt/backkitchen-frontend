import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  loginMock: vi.fn(),
  setAuthMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  authApi: { login: mocks.loginMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    setAuth: mocks.setAuthMock,
  }),
}))

import LoginView from './LoginView.vue'

describe('LoginView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.loginMock.mockReset()
    mocks.setAuthMock.mockReset()
  })

  it('shows validation error when fields are empty', async () => {
    const wrapper = mountWithPlugins(LoginView)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Please enter your email and password.')
    expect(mocks.loginMock).not.toHaveBeenCalled()
  })

  it('calls login API and redirects on success', async () => {
    mocks.loginMock.mockResolvedValue({
      access_token: 'tok-123',
      user: { id: 1, username: 'alice' },
    })

    const wrapper = mountWithPlugins(LoginView)
    await wrapper.find('input[type="email"]').setValue('alice@test.com')
    await wrapper.find('input[type="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mocks.loginMock).toHaveBeenCalledWith('alice@test.com', 'secret')
    expect(mocks.setAuthMock).toHaveBeenCalledWith({ id: 1, username: 'alice' }, 'tok-123')
    expect(mocks.pushMock).toHaveBeenCalledWith('/')
  })

  it('shows API error message on login failure', async () => {
    mocks.loginMock.mockRejectedValue(new Error('Invalid credentials'))

    const wrapper = mountWithPlugins(LoginView)
    await wrapper.find('input[type="email"]').setValue('bad@test.com')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('Invalid credentials')
  })

  it('disables submit button while loading', async () => {
    let resolveLogin: (v: unknown) => void
    mocks.loginMock.mockReturnValue(new Promise(r => { resolveLogin = r }))

    const wrapper = mountWithPlugins(LoginView)
    await wrapper.find('input[type="email"]').setValue('a@b.com')
    await wrapper.find('input[type="password"]').setValue('pass')
    wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    resolveLogin!({ access_token: 't', user: { id: 1 } })
    await Promise.resolve()
    await Promise.resolve()
  })
})
