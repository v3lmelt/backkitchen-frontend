import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import { useToast } from '@/composables/useToast'

const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  issueApi: { create: mocks.createMock },
}))

import IssueCreatePanel from './IssueCreatePanel.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

function clipboardFileItem(file: File, type = file.type): DataTransferItem {
  return {
    kind: 'file',
    type,
    getAsFile: () => file,
  } as DataTransferItem
}

function pasteEventWith(items: DataTransferItem[]): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { items },
  })
  return event
}

describe('IssueCreatePanel', () => {
  beforeEach(() => {
    mocks.createMock.mockReset()
    localStorage.clear()
    useToast().toasts.value = []
    mocks.createMock.mockResolvedValue({
      id: 99,
      phase: 'peer',
      workflow_cycle: 1,
      markers: [{ id: 1, issue_id: 99, marker_type: 'point', time_start: 1.5, time_end: null }],
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

  it('submits issue with form data and markers', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 7, phase: 'mastering' },
    })

    // Add a marker via handleClick, then fill form
    const vm = wrapper.vm as any
    vm.handleClick(1.5)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button').some(button => ['Reviewers and composer', 'Reviewers only'].includes(button.text()))).toBe(false)

    await wrapper.find('input').setValue('Clicks at 1:30')
    await wrapper.find('textarea').setValue('Audible clicking artifacts')

    // Submit — the submit button is btn-primary text-sm (vs toggle which is text-xs)
    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    const [trackId, payload, onProgress] = mocks.createMock.mock.calls[0]
    expect(trackId).toBe(7)
    expect(payload).toMatchObject({
      title: 'Clicks at 1:30',
      description: 'Audible clicking artifacts',
      severity: 'major',
      visibility: 'public',
      markers: [{ marker_type: 'point', time_start: 1.5, time_end: null }],
    })
    // The backend infers the phase from the current workflow step.
    expect(payload.phase).toBeUndefined()
    expect(typeof onProgress).toBe('function')
  })

  it('adds pasted clipboard images to the issue create payload', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 7, phase: 'mastering' },
    })

    const vm = wrapper.vm as any
    vm.handleClick(1.5)
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('Clicks at 1:30')
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Audible clicking artifacts')

    const image = new File(['png'], 'image.png', { type: 'image/png' })
    const pasteEvent = pasteEventWith([clipboardFileItem(image)])
    textarea.element.dispatchEvent(pasteEvent)
    await flushPromises()

    expect(pasteEvent.defaultPrevented).toBe(true)

    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.createMock.mock.calls[0]
    expect(payload.images).toHaveLength(1)
    expect(payload.images[0].name).toMatch(/^pasted-image-\d{8}-\d{3}\.png$/)
    expect(payload.images[0].type).toBe('image/png')
  })

  it('limits pasted issue images to the existing maximum', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 7, phase: 'mastering' },
    })

    const vm = wrapper.vm as any
    vm.handleClick(1.5)
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('Clicks at 1:30')
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Audible clicking artifacts')

    const files = [1, 2, 3, 4].map(index => new File([`png-${index}`], `image-${index}.png`, { type: 'image/png' }))
    const pasteEvent = pasteEventWith(files.map(file => clipboardFileItem(file)))
    textarea.element.dispatchEvent(pasteEvent)
    await flushPromises()

    expect(useToast().toasts.value.at(-1)?.message).toBe('At most 3 images per issue')

    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.createMock.mock.calls[0]
    expect(payload.images).toHaveLength(3)
    expect(payload.images.map((file: File) => file.name)).toEqual(['image-1.png', 'image-2.png', 'image-3.png'])
  })

  it('hides internal visibility and submits public when explicitly disabled', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 9, phase: 'peer', allowInternalVisibility: false },
    })

    const vm = wrapper.vm as any
    vm.handleClick(4.2)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button').some(button => ['Reviewers and composer', 'Reviewers only'].includes(button.text()))).toBe(false)

    await wrapper.find('input').setValue('Needs balance tweak')
    await wrapper.find('textarea').setValue('Low end is masking the vocal')
    const submitBtn = wrapper.findAll('button').find(button => button.classes().includes('btn-primary') && button.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    expect(mocks.createMock.mock.calls[0][1].visibility).toBe('public')
  })

  it('defaults multi-review issues to public visibility and submits it explicitly', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 9, phase: 'peer', allowInternalVisibility: true },
    })

    const vm = wrapper.vm as any
    vm.handleClick(4.2)
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('Needs balance tweak')
    await wrapper.find('textarea').setValue('Low end is masking the vocal')

    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.createMock.mock.calls[0]
    expect(payload.visibility).toBe('public')
  })

  it('submits internal visibility after the reviewer toggles it manually', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 9, phase: 'peer', allowInternalVisibility: true },
    })

    const vm = wrapper.vm as any
    vm.handleClick(4.2)
    await wrapper.vm.$nextTick()

    const visibilityToggle = wrapper.findAll('button').find(b => b.text().includes('Reviewers and composer'))!
    await visibilityToggle.trigger('click')
    await wrapper.find('input').setValue('Needs balance tweak')
    await wrapper.find('textarea').setValue('Low end is masking the vocal')

    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    const [, payload] = mocks.createMock.mock.calls[0]
    expect(payload.visibility).toBe('internal')
  })

  it('resets internal visibility to public when permission is removed', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 9, phase: 'peer', allowInternalVisibility: true },
    })

    const vm = wrapper.vm as any
    vm.handleClick(4.2)
    await wrapper.vm.$nextTick()

    const visibilityToggle = wrapper.findAll('button').find(button => button.text().includes('Reviewers and composer'))!
    await visibilityToggle.trigger('click')
    await wrapper.setProps({ allowInternalVisibility: false })

    expect(wrapper.findAll('button').some(button => ['Reviewers and composer', 'Reviewers only'].includes(button.text()))).toBe(false)

    await wrapper.find('input').setValue('Needs balance tweak')
    await wrapper.find('textarea').setValue('Low end is masking the vocal')
    const submitBtn = wrapper.findAll('button').find(button => button.classes().includes('btn-primary') && button.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    expect(mocks.createMock.mock.calls[0][1].visibility).toBe('public')
  })

  it('restores an internal draft as public when internal visibility is not allowed', async () => {
    localStorage.setItem('backkitchen_issue_draft:9:peer:none', JSON.stringify({
      showForm: true,
      issueMode: 'timed',
      issueVisibility: 'internal',
      issueVisibilityTouched: true,
      title: 'Draft title',
      description: 'Draft description',
      severity: 'major',
      markers: [{ marker_type: 'point', time_start: 4.2, time_end: null }],
      rangeAnchor: null,
    }))

    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 9, phase: 'peer', allowInternalVisibility: false },
    })
    await wrapper.vm.$nextTick()

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Draft title')
    expect(wrapper.findAll('button').some(button => ['Reviewers and composer', 'Reviewers only'].includes(button.text()))).toBe(false)

    const submitBtn = wrapper.findAll('button').find(button => button.classes().includes('btn-primary') && button.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledTimes(1)
    expect(mocks.createMock.mock.calls[0][1].visibility).toBe('public')
  })

  it('switches mention candidates with public and internal visibility', async () => {
    const publicMentionUsers = [{ id: 1, display_name: 'Submitter' }]
    const internalMentionUsers = [{ id: 2, display_name: 'Reviewer' }]
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: {
        trackId: 9,
        phase: 'peer',
        allowInternalVisibility: true,
        publicMentionUsers,
        internalMentionUsers,
      },
    })

    const vm = wrapper.vm as any
    vm.handleClick(4.2)
    await wrapper.vm.$nextTick()

    expect(vm.activeMentionUsers).toEqual(publicMentionUsers)

    const visibilityToggle = wrapper.findAll('button').find(b => b.text().includes('Reviewers and composer'))!
    await visibilityToggle.trigger('click')

    expect(vm.activeMentionUsers).toEqual(internalMentionUsers)
  })

  it('emits created event after successful submit', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    // Add a marker first
    const vm = wrapper.vm as any
    vm.handleClick(2.0)
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('Test')
    await wrapper.find('textarea').setValue('Desc')
    const submitBtn = wrapper.findAll('button').find(b => b.classes().includes('btn-primary') && b.classes().includes('text-sm'))!
    await submitBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('exposes handleClick that adds point marker and opens form', () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    const vm = wrapper.vm as any
    vm.handleClick(3.456)
    expect(vm.showForm).toBe(true)
  })

  it('exposes handleRangeSelect that adds range marker and opens form', () => {
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
    await wrapper.find('button.btn-primary.text-xs').trigger('click')
    expect(wrapper.find('input').exists()).toBe(true)

    await wrapper.findAll('button').find(b => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('requires confirmation before discarding a non-empty draft', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    await wrapper.find('button.btn-primary.text-xs').trigger('click')
    await wrapper.find('input').setValue('Draft issue')

    await wrapper.findAll('button').find(button => button.text() === 'Discard draft')!.trigger('click')
    expect(wrapper.getComponent(ConfirmModal).props('title')).toBe('Discard issue draft?')
    wrapper.getComponent(ConfirmModal).vm.$emit('cancel')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Draft issue')

    await wrapper.findAll('button').find(button => button.text() === 'Discard draft')!.trigger('click')
    wrapper.getComponent(ConfirmModal).vm.$emit('confirm')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('input').exists()).toBe(false)
    expect(localStorage.getItem('backkitchen_issue_draft:1:peer:none')).toBeNull()
  })

  it('confirms before switching to a general issue removes timed markers', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })
    const vm = wrapper.vm as any
    vm.handleClick(2.5)
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(button => button.text() === 'General Issue')!.trigger('click')
    expect(wrapper.getComponent(ConfirmModal).props('message')).toContain('1 timed marker')
    wrapper.getComponent(ConfirmModal).vm.$emit('cancel')
    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(1)

    await wrapper.findAll('button').find(button => button.text() === 'General Issue')!.trigger('click')
    wrapper.getComponent(ConfirmModal).vm.$emit('confirm')
    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(0)
  })

  it('shows draft, severity, attachment, and visibility guidance', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer', allowInternalVisibility: true },
    })
    await wrapper.find('button.btn-primary.text-xs').trigger('click')

    expect(wrapper.text()).toContain('The draft is saved in this browser')
    expect(wrapper.text()).toContain('Critical: blocks approval or delivery')
    expect(wrapper.text()).toContain('Up to 3 audio files, 200 MB each')
    expect(wrapper.text()).toContain('Up to 3 images, 10 MB each')
    expect(wrapper.text()).toContain('Visible to review participants, album managers, and the composer')
  })

  it('toggles same point marker off on second click', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    const vm = wrapper.vm as any
    vm.handleClick(2.5)
    vm.handleClick(2.5)

    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(0)
  })

  it('toggles same range marker off on second drag selection', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    const vm = wrapper.vm as any
    vm.handleRangeSelect(1.0, 2.0)
    vm.handleRangeSelect(1.0, 2.0)

    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(0)
  })

  it('toggles near-identical range marker off within tolerance', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    const vm = wrapper.vm as any
    vm.handleRangeSelect(1.0, 2.0)
    vm.handleRangeSelect(1.02, 2.03)

    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(0)
  })

  it('removes duplicate near-identical ranges together when toggling', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    const vm = wrapper.vm as any
    vm.markers.push({ marker_type: 'range', time_start: 1.0, time_end: 2.0 })
    vm.markers.push({ marker_type: 'range', time_start: 1.03, time_end: 2.02 })

    vm.handleRangeSelect(1.01, 2.01)

    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(0)
  })

  it('removes last marker through exposed helper', async () => {
    const wrapper = mountWithPlugins(IssueCreatePanel, {
      props: { trackId: 1, phase: 'peer' },
    })

    const vm = wrapper.vm as any
    vm.handleClick(1.0)
    vm.handleClick(2.0)
    vm.removeLastMarker()

    await wrapper.vm.$nextTick()
    expect(vm.markers).toHaveLength(1)
    expect(vm.markers[0].time_start).toBe(1)
  })

  it('inserts @issue:N into the description when picking from the issue mention popover', async () => {
    const issues = [
      {
        id: 11,
        track_id: 1,
        local_number: 7,
        author_id: 2,
        phase: 'peer',
        workflow_cycle: 1,
        source_version_id: null,
        source_version_number: 1,
        master_delivery_id: null,
        title: 'Vocal balance',
        description: '',
        severity: 'major',
        status: 'open',
        markers: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        comments: [],
      },
    ]

    const wrapper = mountWithPlugins(IssueCreatePanel, {
      attachTo: document.body,
      props: { trackId: 1, phase: 'peer', issues },
    })

    const vm = wrapper.vm as any
    vm.handleClick(1.0)
    await wrapper.vm.$nextTick()

    const textarea = wrapper.find('textarea')
    const el = textarea.element as HTMLTextAreaElement
    el.value = 'Compare @i'
    el.selectionStart = el.value.length
    el.selectionEnd = el.value.length
    await textarea.trigger('input')
    await wrapper.vm.$nextTick()

    const items = wrapper.findAll('[data-issue-mention-item]')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('Vocal balance')

    await items[0].trigger('mousedown')
    await wrapper.vm.$nextTick()

    expect((textarea.element as HTMLTextAreaElement).value).toBe('Compare @issue:7 ')

    wrapper.unmount()
  })
})
