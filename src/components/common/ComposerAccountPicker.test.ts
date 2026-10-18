import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { ComposerAccount } from '@/types'
import { mountWithPlugins } from '@/tests/utils'
import ComposerAccountPicker from './ComposerAccountPicker.vue'

const mocks = vi.hoisted(() => ({ candidates: vi.fn() }))
vi.mock('@/api', () => ({ albumApi: { listComposerCandidates: mocks.candidates } }))
const nova: ComposerAccount = { id: 2, username: 'nova', display_name: 'Nova' }
const echo: ComposerAccount = { id: 3, username: 'echo', display_name: 'Echo' }
let wrapper: VueWrapper
function mountPicker(circleBound = false, excludedUserIds: number[] = []) {
  wrapper = mountWithPlugins(ComposerAccountPicker, {
    props: { albumId: 1, circleBound, excludedUserIds },
    global: { stubs: { teleport: true } },
  })
  return wrapper
}
async function search(term: string) {
  await wrapper.find('input').setValue(term)
  await wrapper.find('form').trigger('submit')
}

describe('ComposerAccountPicker', () => {
  beforeEach(() => mocks.candidates.mockReset())
  afterEach(() => wrapper.unmount())

  it('ignores late responses after a newer search and clears results on edits', async () => {
    const old = Promise.withResolvers<ComposerAccount[]>()
    const latest = Promise.withResolvers<ComposerAccount[]>()
    mocks.candidates.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    mountPicker()
    await search('nova')
    await search('echo')
    latest.resolve([echo])
    await flushPromises()
    old.resolve([nova])
    await flushPromises()
    expect(wrapper.text()).toContain('@echo')
    expect(wrapper.text()).not.toContain('@nova')
    await wrapper.find('input').setValue('another')
    expect(wrapper.text()).not.toContain('@echo')
  })

  it('excludes bound composers while retaining selectable accounts', async () => {
    mocks.candidates.mockResolvedValue([nova, echo])
    mountPicker(true, [nova.id])
    await flushPromises()
    expect(wrapper.text()).not.toContain('@nova')
    await wrapper.findAll('button').find(button => button.text().includes('@echo'))!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[echo]])
  })

  it('retries a failed search with its current term and selects the recovered account', async () => {
    mocks.candidates.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([nova])
    mountPicker()
    await search('nova')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('nova')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('@nova'))!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[nova]])
  })
})
