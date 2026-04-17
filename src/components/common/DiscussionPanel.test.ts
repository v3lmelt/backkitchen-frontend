import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  currentUser: { id: 1 },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/api', () => ({
  resolveAssetUrl: (url: string) => url,
}))

vi.mock('@/components/common/CommentInput.vue', () => ({
  default: {
    template: '<div class="comment-input-stub" />',
  },
}))

vi.mock('@/components/common/EditHistoryModal.vue', () => ({
  default: {
    template: '<div class="edit-history-stub" />',
  },
}))

import DiscussionPanel from './DiscussionPanel.vue'

describe('DiscussionPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mocks.currentUser = { id: 1 }
  })

  it('asks for confirmation before emitting a removal event', async () => {
    const wrapper = mountWithPlugins(DiscussionPanel, {
      attachTo: document.body,
      props: {
        discussions: [
          {
            id: 7,
            author_id: 1,
            author: { id: 1, display_name: 'Nova', avatar_color: '#123456' },
            content: 'Please update the intro balance.',
            created_at: '2024-01-02T00:00:00Z',
            images: [],
            audios: [],
          },
        ],
        heading: 'Discussion',
        emptyText: 'Empty',
        placeholder: 'Write a note',
        submitLabel: 'Post',
        posting: false,
        postingProgress: 0,
        editingId: null,
        editingContent: '',
        historyItems: [],
        showHistoryForId: null,
      },
    })

    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    await flushPromises()

    expect(wrapper.emitted('remove')).toBeUndefined()
    expect(document.body.textContent).toContain('Delete Discussion')

    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Delete')
    expect(confirmButton).toBeTruthy()

    confirmButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ id: 7 })

    wrapper.unmount()
  })

  it('forwards issue reference clicks from discussion content', async () => {
    const wrapper = mountWithPlugins(DiscussionPanel, {
      props: {
        discussions: [
          {
            id: 8,
            author_id: 2,
            author: { id: 2, display_name: 'Kira', avatar_color: '#654321' },
            content: 'Please revisit @issue:12 before final approval.',
            created_at: '2024-01-02T00:00:00Z',
            images: [],
            audios: [],
          },
        ],
        issues: [
          {
            id: 412,
            track_id: 7,
            local_number: 12,
            author_id: 2,
            phase: 'producer',
            workflow_cycle: 1,
            source_version_id: null,
            source_version_number: 2,
            master_delivery_id: null,
            title: 'Balance pass',
            description: 'The chorus needs another balance pass.',
            severity: 'major',
            status: 'open',
            markers: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            comments: [],
          },
        ],
        heading: 'Discussion',
        emptyText: 'Empty',
        placeholder: 'Write a note',
        submitLabel: 'Post',
        posting: false,
        postingProgress: 0,
        editingId: null,
        editingContent: '',
        historyItems: [],
        showHistoryForId: null,
      },
    })

    const issueButton = wrapper.findAll('button').find(button => button.text() === '@issue:12')
    expect(issueButton).toBeTruthy()

    await issueButton!.trigger('click')

    expect(wrapper.emitted('openIssue')).toEqual([[412]])
  })
})
