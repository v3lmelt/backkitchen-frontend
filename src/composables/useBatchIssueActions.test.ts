import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import type { Ref } from 'vue'
import { createTestI18n } from '@/tests/utils'
import { historyIssue } from '@/tests/issueHistoryFixtures'
import type { Issue } from '@/types'

const mocks = vi.hoisted(() => ({ batch: vi.fn(), error: vi.fn() }))
vi.mock('@/api', () => ({ issueApi: { batchUpdate: mocks.batch } }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ error: mocks.error }) }))
import { useBatchIssueActions } from './useBatchIssueActions'

interface BatchActions {
  applyBatchIssueStatusChange: (issues: Issue[], ids: Ref<number[]>, note: Ref<string>, status: Issue['status']) => Promise<void>
  availableBatchActionsForIssue: (issue: Issue) => Issue['status'][]
}

describe('batch issue history synchronization', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates all visible and current copies while keeping historical mutations out of current-cycle workflow data', async () => {
    const current = historyIssue()
    const historical = historyIssue({ id: 2, workflow_cycle: 1 })
    const issues = ref([current, historical])
    const currentIssues = ref([current])
    const selectedIssue = ref<Issue | null>(historical)
    const ids = ref([1, 2])
    const note = ref('Fixed')
    let actions: BatchActions | undefined
    const component = defineComponent({ setup() {
      actions = useBatchIssueActions({ trackId: ref(9), issues, additionalIssues: [currentIssues], selectedIssue,
        canSubmitStatus: () => false, canChangeStatus: () => true })
      return () => null
    } })
    const wrapper = mount(component, { global: { plugins: [createTestI18n()] } })
    mocks.batch.mockResolvedValue([{ ...current, status: 'resolved' }, { ...historical, status: 'internal_resolved' }])
    await actions!.applyBatchIssueStatusChange(issues.value, ids, note, 'resolved')
    expect(issues.value.map(issue => issue.status)).toEqual(['resolved', 'internal_resolved'])
    expect(currentIssues.value.map(issue => [issue.id, issue.status])).toEqual([[1, 'resolved']])
    expect(selectedIssue.value?.status).toBe('internal_resolved')
    expect(ids.value).toEqual([])
    expect(note.value).toBe('')
    wrapper.unmount()
  })

  it('keeps context and selection unchanged when a historical batch mutation is denied', async () => {
    const historical = historyIssue({ workflow_cycle: 1 })
    const issues = ref([historical])
    const currentIssues = ref<Issue[]>([])
    const ids = ref([historical.id])
    const note = ref('Retry note')
    let actions: BatchActions | undefined
    const wrapper = mount(defineComponent({ setup() {
      actions = useBatchIssueActions({ trackId: ref(9), issues, additionalIssues: [currentIssues],
        canSubmitStatus: () => false, canChangeStatus: () => true })
      return () => null
    } }), { global: { plugins: [createTestI18n()] } })
    mocks.batch.mockRejectedValue(new Error('No permission'))
    await actions!.applyBatchIssueStatusChange(issues.value, ids, note, 'resolved')
    expect(issues.value[0].status).toBe('open')
    expect(currentIssues.value).toEqual([])
    expect(ids.value).toEqual([historical.id])
    expect(note.value).toBe('Retry note')
    wrapper.unmount()
  })
})
