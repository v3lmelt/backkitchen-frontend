import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  issueApi: { create: mocks.createMock },
}))

import IssueCreatePanel from './IssueCreatePanel.vue'

describe('IssueCreatePanel', () => {
  beforeEach(() => {
    mocks.createMock.mockReset()
    mocks.createMock.mockResolvedValue({
      id: 99,
      phase: 'peer',
      workflow_cycle: 1,
      time_start: 1.5,
    })
  })

  it('shows add issue button initially', () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    expect(wrapper.find('button.btn-primary').exists()).toBe(true)
    // Form should be hidden
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('toggles form visibility on add button click', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    await wrapper.find('button.btn-primary').trigger('click')
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('submits issue with form data', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 7, phase: 'mastering' },
    })

    // Open form
    await wrapper.find('button.btn-primary').trigger('click')

    // Fill form
    await wrapper.find('input').setValue('Clicks at 1:30')
    await wrapper.find('textarea').setValue('Audible clicking artifacts')

    // Submit — the submit button is btn-primary text-sm (vs toggle which is text-xs)
    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.createMock).toHaveBeenCalledWith(7, expect.objectContaining({
      title: 'Clicks at 1:30',
      description: 'Audible clicking artifacts',
      severity: 'major',
      issue_type: 'point',
      phase: 'mastering',
    }))
  })

  it('emits created event after successful submit', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.find('input').setValue('Test')
    await wrapper.find('textarea').setValue('Desc')
    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('exposes handleClick that sets point time and opens form', () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    const vm = wrapper.vm as any
    vm.handleClick(3.456)
    expect(vm.showForm).toBe(true)
  })

  it('exposes handleRangeSelect that sets range and opens form', () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    const vm = wrapper.vm as any
    vm.handleRangeSelect(1.0, 5.0)
    expect(vm.showForm).toBe(true)
  })

  it('hides form on cancel click', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    await wrapper.find('button.btn-primary').trigger('click')
    expect(wrapper.find('input').exists()).toBe(true)

    await wrapper.findAll('button').find(b => b.classes().includes('btn-secondary'))!.trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
  })
})
