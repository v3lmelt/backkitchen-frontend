import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import ReviewManagementModal from './ReviewManagementModal.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), candidates: vi.fn(), assignments: vi.fn(), save: vi.fn() }))
vi.mock('@/api', () => ({ trackApi: { get: mocks.get, listReviewerCandidates: mocks.candidates, listAssignments: mocks.assignments, manageReview: mocks.save } }))
const users = [1, 2, 3].map(id => ({ user_id: id, user: { id, display_name: `Reviewer ${id}` } }))
const step = { id: 'peer_review', type: 'review', label: 'Peer Review', transitions: { pass: 'producer_gate', needs_revision: 'peer_revision' } }
const history = [
  { id: 11, stage_id: 'peer_review', user_id: 1, status: 'completed', decision: 'pass', user: users[0]!.user },
  { id: 12, stage_id: 'peer_review', user_id: 2, status: 'pending', user: users[1]!.user },
]
function mountModal() {
  return mountWithPlugins(ReviewManagementModal, { props: { trackId: 7 }, global: { stubs: { BaseModal: { template: '<div><slot /></div>' } } } })
}
function button(wrapper: ReturnType<typeof mountModal>, text: string) {
  return wrapper.findAll('button').find(node => node.text() === text)!
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({ track: { id: 7, viewer_can_manage_review: true, workflow_step: step,
    review_state: { step_id: 'peer_review', flexible: false, flexible_available: true, state_version: 'snapshot-1' } },
  workflow_config: { steps: [{ ...step, order: 1 }, { id: 'producer_gate', label: 'Producer Gate', order: 2 }] } })
  mocks.candidates.mockResolvedValue(users)
  mocks.assignments.mockResolvedValue(history)
  mocks.save.mockResolvedValue({ id: 7 })
})

describe('ReviewManagementModal', () => {
  it('requires explicit enabling, allows more reviewers, and saves only after preview', async () => {
    const wrapper = mountModal()
    await flushPromises()
    expect(button(wrapper, 'Preview changes').attributes('disabled')).toBeDefined()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('input[value="3"]').setValue(true)
    await button(wrapper, 'Preview changes').trigger('click')
    expect(wrapper.text()).toContain('Reviewer 3')
    expect(wrapper.text()).toContain('1/3 complete')
    expect(mocks.save).not.toHaveBeenCalled()
    await button(wrapper, 'Confirm').trigger('click')
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(7, { stage_id: 'peer_review', flexible: true, user_ids: [1, 2, 3], state_version: 'snapshot-1' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('previews immediate advancement when removing the last pending reviewer', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('input[value="2"]').setValue(false)
    await button(wrapper, 'Preview changes').trigger('click')
    expect(wrapper.text()).toContain('immediately finish this review')
    expect(wrapper.text()).toContain('Reviewer 2')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('blocks an empty roster and forces reload after a stale save', async () => {
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('input[value="1"]').setValue(false)
    await wrapper.find('input[value="2"]').setValue(false)
    expect(button(wrapper, 'Preview changes').attributes('disabled')).toBeDefined()
    await wrapper.find('input[value="3"]').setValue(true)
    await button(wrapper, 'Preview changes').trigger('click')
    mocks.save.mockRejectedValueOnce(new Error('Review state changed'))
    await button(wrapper, 'Confirm').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Reload the roster')
    expect(button(wrapper, 'Preview changes').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Retry').trigger('click')
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
