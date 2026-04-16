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
})
