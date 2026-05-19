import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  loadMock: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: { id: 1 } }),
}))

vi.mock('@/api', () => ({
  resolveAssetUrl: (url: string) => url,
}))

vi.mock('@/composables/useDiscussions', () => ({
  useDiscussions: () => ({
    discussions: ref([]),
    loading: ref(false),
    loadError: ref(''),
    posting: ref(false),
    postingProgress: ref(0),
    editingId: ref(null),
    editingContent: ref(''),
    historyItems: ref([]),
    showHistoryForId: ref(null),
    load: mocks.loadMock,
    applyRealtimeEvent: vi.fn(),
    submit: vi.fn(),
    startEdit: vi.fn(),
    saveEdit: vi.fn(),
    cancelEdit: vi.fn(),
    remove: vi.fn(),
    showHistory: vi.fn(),
    closeHistory: vi.fn(),
    openImage: vi.fn(),
  }),
}))

vi.mock('@/components/common/CommentInput.vue', () => ({
  default: {
    template: '<div class="comment-input-stub" />',
  },
}))

vi.mock('@/components/common/TimestampText.vue', () => ({
  default: {
    props: ['text'],
    template: '<span>{{ text }}</span>',
  },
}))

vi.mock('@/components/common/EditHistoryModal.vue', () => ({
  default: {
    template: '<div class="edit-history-stub" />',
  },
}))

import MasteringChatSidebar from './MasteringChatSidebar.vue'

describe('MasteringChatSidebar', () => {
  beforeEach(() => {
    mocks.loadMock.mockReset()
  })

  it('toggles the mastering chat panel between side and full-screen layouts', async () => {
    const wrapper = mountWithPlugins(MasteringChatSidebar, {
      props: { trackId: 7 },
    })

    await wrapper.find('button[title="Open mastering communication"]').trigger('click')
    await wrapper.vm.$nextTick()

    let panel = wrapper.find('[data-testid="mastering-chat-panel"]')
    expect(panel.classes()).toContain('w-[360px]')
    expect(panel.classes()).not.toContain('inset-0')

    await wrapper.find('button[title="Expand mastering communication"]').trigger('click')
    await wrapper.vm.$nextTick()

    panel = wrapper.find('[data-testid="mastering-chat-panel"]')
    expect(panel.classes()).toContain('inset-0')
    expect(panel.classes()).toContain('w-full')

    await wrapper.find('button[title="Close mastering communication"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('button[title="Open mastering communication"]').trigger('click')
    await wrapper.vm.$nextTick()

    panel = wrapper.find('[data-testid="mastering-chat-panel"]')
    expect(panel.classes()).toContain('w-[360px]')
    expect(panel.classes()).not.toContain('inset-0')
  })
})
