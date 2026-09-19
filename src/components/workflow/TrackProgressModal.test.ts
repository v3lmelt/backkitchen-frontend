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
      props: { track: { id: 7, title: 'Track', status: 'peer_review' }, config: { steps: [
        { id: 'peer_review', label: 'Peer Review' }, { id: 'producer_gate', label: 'Producer Gate' }, { id: 'mastering', label: 'Mastering' },
      ] } }, global: { stubs: { BaseModal: { template: '<div><slot /></div>' } } },
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
})
