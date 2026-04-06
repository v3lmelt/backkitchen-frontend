import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  resendVerificationMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  authApi: { register: mocks.registerMock, resendVerification: mocks.resendVerificationMock },
}))

vi.mock('lucide-vue-next', () => ({
  Music: { template: '<svg />' },
  AlertCircle: { template: '<svg />' },
  Eye: { template: '<svg />' },
  EyeOff: { template: '<svg />' },
  Mail: { template: '<svg />' },
  CheckCircle2: { template: '<svg />' },
  Check: { template: '<svg />' },
  Circle: { template: '<svg />' },
}))

import RegisterView from './RegisterView.vue'

async function fillForm(wrapper: ReturnType<typeof mountWithPlugins>, overrides: Record<string, string | boolean> = {}) {
  const defaults: Record<string, string> = {
    username: 'ada',
    email: 'ada@test.com',
    password: 'password123',
    confirmPassword: 'password123',
    ...overrides,
  } as Record<string, string>
  const inputs = wrapper.findAll('input')
  await inputs[0].setValue(defaults.username)
  await inputs[1].setValue(defaults.email)
  await inputs[2].setValue(defaults.password)
  await inputs[3].setValue(defaults.confirmPassword)
  if (overrides.termsAccepted !== false) {
    await inputs[4].setValue(true)
  }
}

describe('RegisterView', () => {
  beforeEach(() => {
    mocks.registerMock.mockReset()
    mocks.resendVerificationMock.mockReset()
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
    await fillForm(wrapper, { termsAccepted: false })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('You must accept the terms to continue.')
  })

  it('calls register API with the submitted credentials', async () => {
    mocks.registerMock.mockResolvedValue({
      email: 'ada@test.com',
    })

    const wrapper = mountWithPlugins(RegisterView)
    await fillForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await flushPromises()

    expect(mocks.registerMock).toHaveBeenCalledWith(expect.objectContaining({
      username: 'ada',
      email: 'ada@test.com',
      password: 'password123',
    }))
  })

  it('shows duplicate account error', async () => {
    mocks.registerMock.mockRejectedValue(new Error('already exists'))

    const wrapper = mountWithPlugins(RegisterView)
    await fillForm(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('An account with this email already exists.')
  })
})
