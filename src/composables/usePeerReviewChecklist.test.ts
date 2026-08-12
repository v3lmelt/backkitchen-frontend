import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { createTestI18n } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  getDraftMock: vi.fn(),
  getTemplateMock: vi.fn(),
  submitMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  appStore: {
    currentUser: { id: 1 },
  },
}))

vi.mock('@/api', () => ({
  checklistApi: {
    getDraft: mocks.getDraftMock,
    getTemplate: mocks.getTemplateMock,
    submit: mocks.submitMock,
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => mocks.appStore,
}))

import { usePeerReviewChecklist } from './usePeerReviewChecklist'
import type { ChecklistItem, Track, TrackDetailResponse } from '@/types'

type Composable = ReturnType<typeof usePeerReviewChecklist>

function savedItem(label: string, passed: boolean, note = ''): ChecklistItem {
  return {
    id: 41,
    track_id: 9,
    reviewer_id: 1,
    source_version_id: 101,
    workflow_cycle: 1,
    label,
    passed,
    note,
    created_at: '2024-01-01T00:00:00Z',
  } as unknown as ChecklistItem
}

function mountHarness(overrides: {
  checklistItems?: ChecklistItem[]
  albumChecklistEnabled?: boolean
} = {}) {
  let captured: Composable | null = null
  const track = ref<Track | null>({
    id: 9,
    album_id: 3,
    workflow_cycle: 1,
    current_source_version: { id: 101 },
  } as unknown as Track)
  const error = ref('')
  const reload = vi.fn().mockResolvedValue(undefined)
  const detail = {
    album: overrides.albumChecklistEnabled == null
      ? null
      : { checklist_enabled: overrides.albumChecklistEnabled },
    track: { album_checklist_enabled: overrides.albumChecklistEnabled ?? true },
    checklist_items: overrides.checklistItems ?? [],
  } as unknown as TrackDetailResponse
  const Comp = defineComponent({
    setup() {
      captured = usePeerReviewChecklist({
        trackId: ref(9),
        track: track as Ref<Track | null>,
        currentSourceVersionId: ref(101),
        reviewAssignments: ref([]),
        error,
        reload,
      })
      return () => null
    },
  })
  setActivePinia(createPinia())
  const wrapper = mount(Comp, {
    global: { plugins: [createTestI18n()] },
  })
  return {
    wrapper,
    composable: captured as unknown as Composable,
    error,
    reload,
    detail,
  }
}

describe('usePeerReviewChecklist', () => {
  beforeEach(() => {
    mocks.getDraftMock.mockReset()
    mocks.getTemplateMock.mockReset()
    mocks.submitMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.appStore.currentUser = { id: 1 }
  })

  it('applies detail payload and derives enabled/saved flags', () => {
    const { composable, detail, wrapper } = mountHarness({
      checklistItems: [savedItem('Balance', true)],
      albumChecklistEnabled: true,
    })

    composable.applyDetail(detail)

    expect(composable.albumChecklistEnabled.value).toBe(true)
    expect(composable.isPeerReviewChecklistEnabled.value).toBe(true)
    expect(composable.checklistItems.value).toHaveLength(1)
    expect(composable.checklistSaved.value).toBe(true)
    expect(composable.checklistPassedCount.value).toBe(1)
    wrapper.unmount()
  })

  it('treats the checklist as always saved when the album disables it', () => {
    const { composable, detail, wrapper } = mountHarness({
      albumChecklistEnabled: false,
    })

    composable.applyDetail(detail)

    expect(composable.isPeerReviewChecklistEnabled.value).toBe(false)
    expect(composable.checklistSaved.value).toBe(true)
    wrapper.unmount()
  })

  it('builds the draft from the template and existing saved items', async () => {
    mocks.getDraftMock.mockRejectedValue(new Error('no draft'))
    mocks.getTemplateMock.mockResolvedValue({
      items: [
        { label: 'Balance', required: true, sort_order: 1 },
        { label: 'Arrangement', required: true, sort_order: 0 },
      ],
      is_default: false,
    })
    const { composable, detail, wrapper } = mountHarness({
      checklistItems: [savedItem('Balance', true, 'old note')],
    })
    composable.applyDetail(detail)

    await composable.loadPeerChecklist(3)

    expect(composable.checklistDraft.value).toEqual([
      { label: 'Arrangement', passed: false, note: '' },
      { label: 'Balance', passed: true, note: 'old note' },
    ])
    // The draft covers template labels beyond the saved set → dirty.
    expect(composable.checklistDirty.value).toBe(true)
    wrapper.unmount()
  })

  it('marks the draft dirty after an edit and persists via submitChecklist', async () => {
    mocks.getDraftMock.mockRejectedValue(new Error('no draft'))
    mocks.getTemplateMock.mockResolvedValue({
      items: [{ label: 'Balance', required: true, sort_order: 0 }],
      is_default: false,
    })
    mocks.submitMock.mockResolvedValue([savedItem('Balance', true, 'updated')])
    const { composable, detail, reload, wrapper } = mountHarness({
      checklistItems: [savedItem('Balance', true, 'old note')],
    })
    composable.applyDetail(detail)
    await composable.loadPeerChecklist(3)

    composable.checklistDraft.value[0].note = 'updated'
    expect(composable.checklistDirty.value).toBe(true)

    await composable.submitChecklist()
    await flushPromises()

    expect(mocks.submitMock).toHaveBeenCalledWith(9, [
      { label: 'Balance', passed: true, note: 'updated' },
    ])
    expect(reload).toHaveBeenCalled()
    expect(mocks.toastSuccessMock).toHaveBeenCalled()
    expect(composable.checklistItems.value[0].note).toBe('updated')
    wrapper.unmount()
  })

  it('falls back to the default template when both draft and template load fail', async () => {
    mocks.getDraftMock.mockRejectedValue(new Error('no draft'))
    mocks.getTemplateMock.mockRejectedValue(new Error('no template'))
    const { composable, wrapper } = mountHarness()

    await composable.loadPeerChecklist(3)

    expect(composable.checklistDraft.value.map(item => item.label)).toEqual([
      'Arrangement',
      'Balance',
      'Low-End',
      'Stereo Image',
      'Technical Cleanliness',
    ])
    wrapper.unmount()
  })

  it('resets the draft and items for non-review variants and track changes', () => {
    const { composable, detail, wrapper } = mountHarness({
      checklistItems: [savedItem('Balance', true)],
    })
    composable.applyDetail(detail)
    composable.checklistDraft.value = [{ label: 'Balance', passed: true, note: '' }]

    composable.resetTemplate()
    expect(composable.checklistDraft.value).toEqual([])
    expect(composable.checklistPrefill.value).toBe(null)

    composable.resetForTrackChange()
    expect(composable.checklistItems.value).toEqual([])
    wrapper.unmount()
  })
})
