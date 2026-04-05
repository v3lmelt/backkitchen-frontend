import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  registerMock: vi.fn(),
  setAuthMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  authApi: { register: mocks.registerMock },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    setAuth: mocks.setAuthMock,
  }),
}))

import RegisterView from './RegisterView.vue'

async function fillForm(wrapper: ReturnType<typeof mountWithPlugins>, overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    firstName: 'Ada',
    email: 'ada@test.com',
    password: 'password123',
    confirmPassword: 'password123',
    ...overrides,
  }
  const inputs = wrapper.findAll('input')
  // Order: firstName, lastName, email, password, confirmPassword, terms checkbox
  await inputs[0].setValue(defaults.firstName)
  if (defaults.lastName) await inputs[1].setValue(defaults.lastName)
  await inputs[2].setValue(defaults.email)
  await inputs[3].setValue(defaults.password)
  await inputs[4].setValue(defaults.confirmPassword)
  // Check terms
  await inputs[5].setValue(true)
}

describe('RegisterView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.registerMock.mockReset()
    mocks.setAuthMock.mockReset()
  })

  it('shows error when required fields are empty', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Please fill in all required fields.')
    expect(mocks.registerMock).not.toHaveBeenCalled()
  })

  it('shows error when passwords do not match', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    await fillForm(wrapper, { confirmPassword: 'different' })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Passwords do not match.')
  })

  it('shows error when terms not accepted', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('Ada')
    await inputs[2].setValue('ada@test.com')
    await inputs[3].setValue('password123')
    await inputs[4].setValue('password123')
    // Don't check terms
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('You must accept the terms to continue.')
  })

  it('calls register API and redirects on success', async () => {
    mocks.registerMock.mockResolvedValue({
      access_token: 'tok-new',
      user: { id: 2, username: 'ada@test.com', display_name: 'Ada' },
    })

    const wrapper = mountWithPlugins(RegisterView)
    await fillForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.registerMock).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ada@test.com',
      password: 'password123',
      display_name: 'Ada',
    }))
    expect(mocks.setAuthMock).toHaveBeenCalled()
    expect(mocks.pushMock).toHaveBeenCalledWith('/')
  })

  it('shows duplicate account error', async () => {
    mocks.registerMock.mockRejectedValue(new Error('already exists'))

    const wrapper = mountWithPlugins(RegisterView)
    await fillForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('An account with this email already exists.')
  })
})
