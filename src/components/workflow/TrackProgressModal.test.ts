import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import TrackProgressModal from './TrackProgressModal.vue'

const mocks = vi.hoisted(() => ({ forceStatus: vi.fn() }))
vi.mock('@/api', () => ({ trackApi: mocks }))
beforeEach(() => { mocks.forceStatus.mockReset(); mocks.forceStatus.mockResolvedValue({ id: 7 }) })
describe('TrackProgressModal', () => {
  it('requires a reason for a multi-stage jump and confirms before saving', async () => {
    const wrapper = mountWithPlugins(TrackProgressModal, {
      props: { open: true, track: { id: 7, title: 'Track', status: 'peer_review' }, config: { steps: [
        { id: 'peer_review', label: 'Peer Review' }, { id: 'producer_gate', label: 'Producer Gate' }, { id: 'mastering', label: 'Mastering' },
      ] } }, global: { stubs: { BaseModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } } },
    })
    await wrapper.find('select').setValue('mastering')
    expect(wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined()
    await wrapper.find('input').setValue('Correct imported progress')
    await wrapper.find('button.btn-primary').trigger('click')
    expect(mocks.forceStatus).not.toHaveBeenCalled()
    await wrapper.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.forceStatus).toHaveBeenCalledWith(7, { new_status: 'mastering', reason: 'Correct imported progress' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('resets the reason and confirmation when reopened for another track', async () => {
    const wrapper = mountWithPlugins(TrackProgressModal, {
      props: { track: null, config: { steps: [
        { id: 'peer_review', label: 'Peer Review' }, { id: 'mastering', label: 'Mastering' },
      ] } },
      global: { stubs: { BaseModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } } },
    })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(mocks.forceStatus).not.toHaveBeenCalled()
    await wrapper.setProps({ open: true, track: { id: 7, title: 'First', status: 'peer_review' } })
    await wrapper.find('select').setValue('mastering')
    await wrapper.find('input').setValue('Old reason')
    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.setProps({ open: false, track: null })
    await wrapper.setProps({ open: true, track: { id: 8, title: 'Second', status: 'peer_review' } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('Old reason')
    expect(mocks.forceStatus).not.toHaveBeenCalled()
    await wrapper.find('select').setValue('mastering')
    await wrapper.find('button.btn-primary').trigger('click')
    expect(mocks.forceStatus).not.toHaveBeenCalled()
    await wrapper.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.forceStatus).toHaveBeenCalledWith(8, { new_status: 'mastering', reason: '' })
    wrapper.unmount()
  })

  it('isolates a pending save from a newly opened track', async () => {
    const pending = Promise.withResolvers<{ id: number }>()
    mocks.forceStatus.mockReturnValueOnce(pending.promise)
    const wrapper = mountWithPlugins(TrackProgressModal, {
      props: { open: true, track: { id: 7, title: 'First', status: 'peer_review' }, config: { steps: [
        { id: 'peer_review', label: 'Peer Review' }, { id: 'mastering', label: 'Mastering' },
      ] } },
      global: { stubs: { BaseModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } } },
    })
    await wrapper.find('select').setValue('mastering')
    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.setProps({ open: false, track: null })
    await wrapper.setProps({ open: true, track: { id: 8, title: 'Second', status: 'peer_review' } })
    await wrapper.find('select').setValue('mastering')
    pending.resolve({ id: 7 })
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.find('button.btn-primary').trigger('click')
    await flushPromises()
    expect(mocks.forceStatus).toHaveBeenLastCalledWith(8, { new_status: 'mastering', reason: '' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })
})
