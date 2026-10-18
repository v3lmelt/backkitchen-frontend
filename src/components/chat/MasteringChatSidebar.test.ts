import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import type { Discussion } from '@/types'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({ load: vi.fn(), submit: vi.fn(), apply: vi.fn(), reset: vi.fn() }))
const discussions = ref<Discussion[]>([])
let subscriber: (event: string, id: number) => void
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ currentUser: { id: 1 } }) }))
vi.mock('@/api', () => ({ resolveAssetUrl: (url: string) => url }))
vi.mock('@/composables/useDiscussionRealtime', () => ({ useDiscussionRealtime: () => ({ subscribe: (callback: typeof subscriber) => { subscriber = callback } }) }))
vi.mock('@/composables/useDiscussions', () => ({ useDiscussions: () => ({
  discussions, loading: ref(false), loadError: ref(''), posting: ref(false), postingProgress: ref(0),
  editingId: ref(null), editingContent: ref(''), historyItems: ref([]), showHistoryForId: ref(null),
  load: mocks.load, applyRealtimeEvent: mocks.apply, submit: mocks.submit, startEdit: vi.fn(), saveEdit: vi.fn(),
  cancelEdit: vi.fn(), remove: vi.fn(), showHistory: vi.fn(), closeHistory: vi.fn(), openImage: vi.fn(),
}) }))
vi.mock('@/components/common/CommentInput.vue', () => ({ default: {
  emits: ['submit'], methods: { reset: mocks.reset },
  template: '<button data-submit @click="$emit(\'submit\', { content: \'draft\', images: [], audios: [] })">Send draft</button>',
} }))
vi.mock('@/components/common/TimestampText.vue', () => ({ default: { props: ['text'], template: '<span>{{ text }}</span>' } }))
import MasteringChatSidebar from './MasteringChatSidebar.vue'

let wrapper: VueWrapper
let rowHeight = 50
function message(id: number): Discussion {
  return { id, track_id: 7, author_id: 2, content: `Message ${id}`, created_at: '2026-10-01T00:00:00Z', images: [], audios: [] }
}
async function frame() {
  await nextTick()
  await vi.runAllTimersAsync()
  await nextTick()
}
function installGeometry() {
  const list = wrapper.find('[style*="overflow-anchor"]').element as HTMLElement
  let top = 0
  Object.defineProperties(list, {
    clientHeight: { configurable: true, get: () => 150 },
    scrollHeight: { configurable: true, get: () => discussions.value.length * rowHeight },
    scrollTop: { configurable: true, get: () => top, set: (value: number) => { top = Math.max(0, Math.min(value, discussions.value.length * rowHeight - 150)) } },
  })
  vi.spyOn(list, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 360, 150))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const id = Number(this.dataset.discussionId)
    const index = discussions.value.findIndex(d => d.id === id)
    return new DOMRect(0, index * rowHeight - top, 360, rowHeight)
  })
  return list
}
async function open() {
  await wrapper.find('button[title="Open mastering communication"]').trigger('click')
  const list = installGeometry()
  await frame()
  return list
}
function scroll(list: HTMLElement, top: number) {
  list.scrollTop = top
  list.dispatchEvent(new Event('scroll'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  rowHeight = 50
  discussions.value = Array.from({ length: 20 }, (_, i) => message(i + 1))
  mocks.load.mockResolvedValue(undefined)
  mocks.apply.mockImplementation(async (event: string, id: number) => {
    if (event === 'created' && !discussions.value.some(d => d.id === id)) discussions.value.push(message(id))
    if (event === 'deleted') discussions.value = discussions.value.filter(d => d.id !== id)
  })
  wrapper = mountWithPlugins(MasteringChatSidebar, { props: { trackId: 7 }, global: { stubs: { transition: true, 'transition-group': true } } })
})
afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('MasteringChatSidebar reading continuity', () => {
  it('follows new messages at the bottom and preserves history with deduplicated unread messages', async () => {
    const list = await open()
    expect(list.scrollTop).toBe(850)
    subscriber('created', 21)
    await frame()
    expect(list.scrollTop).toBe(900)
    scroll(list, 212)
    subscriber('created', 22)
    await frame()
    subscriber('created', 22)
    await frame()
    expect(list.scrollTop).toBe(212)
    expect(wrapper.text()).toContain('1 new messages')
    await wrapper.findAll('button').find(button => button.text().includes('1 new messages'))!.trigger('click')
    expect(list.scrollTop).toBe(950)
  })

  it('restores the same offset after fullscreen, reopen, and removal of the anchor', async () => {
    let list = await open()
    scroll(list, 212)
    await wrapper.find('button[title="Expand mastering communication"]').trigger('click')
    rowHeight = 30
    await frame()
    expect(list.scrollTop).toBe(132)
    await wrapper.find('button[title="Exit full-screen mastering communication"]').trigger('click')
    rowHeight = 50
    await frame()
    await wrapper.find('button[title="Close mastering communication"]').trigger('click')
    list = await open()
    expect(list.scrollTop).toBe(212)
    subscriber('deleted', 5)
    await frame()
    expect(list.scrollTop).toBe(212)
    expect(wrapper.find('[data-discussion-id="6"]').element.getBoundingClientRect().top).toBe(-12)
  })

  it('keeps drafts on failed sends despite remote arrivals and resets on deduplicated success', async () => {
    const list = await open()
    scroll(list, 212)
    const failed = Promise.withResolvers<Discussion | null>()
    mocks.submit.mockReturnValueOnce(failed.promise)
    await wrapper.find('[data-submit]').trigger('click')
    subscriber('created', 21)
    await frame()
    failed.resolve(null)
    await frame()
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(list.scrollTop).toBe(212)
    const successful = Promise.withResolvers<Discussion | null>()
    mocks.submit.mockReturnValueOnce(successful.promise)
    await wrapper.find('[data-submit]').trigger('click')
    subscriber('created', 22)
    await frame()
    successful.resolve(message(22))
    await frame()
    expect(mocks.reset).toHaveBeenCalledTimes(1)
    expect(list.scrollTop).toBe(950)
  })

  it('opens a new track at latest and ignores a previous track submit completion', async () => {
    const list = await open()
    scroll(list, 212)
    const pending = Promise.withResolvers<Discussion | null>()
    mocks.submit.mockReturnValueOnce(pending.promise)
    await wrapper.find('[data-submit]').trigger('click')
    await wrapper.setProps({ trackId: 8 })
    await frame()
    expect(list.scrollTop).toBe(850)
    scroll(list, 312)
    mocks.reset.mockClear()
    pending.resolve(message(21))
    await frame()
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(list.scrollTop).toBe(312)
  })
})
