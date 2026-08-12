import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { checklistApi } from '@/api'
import type {
  ChecklistDraftItem,
  ChecklistDraftPrefillMeta,
  ChecklistItem,
  ChecklistTemplateItem,
  StageAssignment,
  Track,
  TrackDetailResponse,
  User,
} from '@/types'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/composables/useToast'
import { defaultPeerChecklistTemplateItems } from '@/utils/checklist'

export interface UsePeerReviewChecklistOptions {
  trackId: Ref<number>
  track: Ref<Track | null>
  currentSourceVersionId: Ref<number | null>
  reviewAssignments: Ref<StageAssignment[]>
  /** Error surface written to when a save fails. */
  error: Ref<string>
  /** Reload the page data after a successful save. */
  reload: () => Promise<void>
}

/**
 * Peer-review checklist state for the workflow step page: the reviewer's
 * editable draft, the saved items, prefill metadata, and the derived
 * saved/dirty flags that gate the review transitions.
 */
export function usePeerReviewChecklist({
  trackId,
  track,
  currentSourceVersionId,
  reviewAssignments,
  error,
  reload,
}: UsePeerReviewChecklistOptions) {
  const { t } = useI18n()
  const { success: toastSuccess } = useToast()
  const appStore = useAppStore()

  const checklistItems = ref<ChecklistItem[]>([])
  const templateItems = ref<ChecklistTemplateItem[]>([])
  const checklistDraft = ref<ChecklistDraftItem[]>([])
  const checklistPrefill = ref<ChecklistDraftPrefillMeta | null>(null)
  const albumChecklistEnabled = ref(true)

  const isPeerReviewChecklistEnabled = computed(() => albumChecklistEnabled.value !== false)
  const currentUserChecklistItems = computed(() =>
    checklistItems.value.filter(item => item.reviewer_id === appStore.currentUser?.id),
  )
  const currentVersionChecklistItems = computed(() =>
    currentUserChecklistItems.value.filter((item) => {
      const cycleMatches =
        track.value?.workflow_cycle == null
        || item.workflow_cycle == null
        || item.workflow_cycle === track.value.workflow_cycle
      const sourceMatches =
        currentSourceVersionId.value == null
        || item.source_version_id == null
        || item.source_version_id === currentSourceVersionId.value
      return cycleMatches && sourceMatches
    }),
  )
  const checklistDraftSnapshot = computed(() =>
    JSON.stringify(
      checklistDraft.value
        .map((item) => ({
          label: item.label,
          passed: item.passed,
          note: (item.note ?? '').trim(),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ),
  )
  const currentVersionChecklistSnapshot = computed(() =>
    JSON.stringify(
      currentVersionChecklistItems.value
        .map((item) => ({
          label: item.label,
          passed: item.passed,
          note: (item.note ?? '').trim(),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ),
  )
  const checklistDirty = computed(() =>
    isPeerReviewChecklistEnabled.value
    && checklistDraft.value.length > 0
    && checklistDraftSnapshot.value !== currentVersionChecklistSnapshot.value,
  )
  const checklistPassedCount = computed(() => checklistItems.value.filter(item => item.passed).length)
  const checklistSaved = computed(() =>
    !isPeerReviewChecklistEnabled.value || currentVersionChecklistItems.value.length > 0,
  )
  const checklistSaveButtonLabel = computed(() =>
    checklistPrefill.value?.reconfirm_required
      ? t('peerReview.reconfirmChecklist')
      : t('peerReview.saveChecklist'),
  )
  const checklistPrefillStateLabel = computed(() => {
    const status = checklistPrefill.value?.status
    if (!status) return ''
    const key = `peerReview.prefillStatus.${status}`
    return t(key, status)
  })
  const checklistByReviewer = computed(() => {
    const groups = new Map<number, { user: User | null | undefined; items: ChecklistItem[] }>()
    for (const item of checklistItems.value) {
      if (!groups.has(item.reviewer_id)) {
        const assignment = reviewAssignments.value.find(a => a.user_id === item.reviewer_id)
        groups.set(item.reviewer_id, { user: assignment?.user, items: [] })
      }
      groups.get(item.reviewer_id)!.items.push(item)
    }
    return Array.from(groups.values())
  })

  /** Apply the checklist fields of a freshly loaded track detail payload. */
  function applyDetail(detail: TrackDetailResponse) {
    albumChecklistEnabled.value = detail.album?.checklist_enabled
      ?? detail.track.album_checklist_enabled
      ?? false
    checklistItems.value = detail.checklist_items
  }

  /** Clear the editable draft (non-review variants, disabled checklist). */
  function resetTemplate() {
    templateItems.value = []
    checklistDraft.value = []
    checklistPrefill.value = null
  }

  /** Clear everything when navigating to a different track. */
  function resetForTrackChange() {
    checklistItems.value = []
  }

  async function loadPeerChecklist(albumId: number) {
    checklistPrefill.value = null

    try {
      const draft = await checklistApi.getDraft(trackId.value)
      templateItems.value = (draft.template_items.length ? draft.template_items : defaultPeerChecklistTemplateItems)
        .map(item => ({ ...item }))
      checklistPrefill.value = draft.prefill

      const orderedTemplateItems = templateItems.value
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)

      const draftByLabel = new Map(
        draft.items.map((item) => [item.label, item] as const),
      )

      checklistDraft.value = orderedTemplateItems.map((item) => {
        const draftItem = draftByLabel.get(item.label)
        return {
          label: item.label,
          passed: draftItem?.passed ?? false,
          note: draftItem?.note ?? '',
        }
      })
      return
    } catch {
      checklistPrefill.value = null
    }

    try {
      const template = await checklistApi.getTemplate(albumId)
      templateItems.value = template.items.map(item => ({ ...item }))
    } catch {
      templateItems.value = defaultPeerChecklistTemplateItems.map(item => ({ ...item }))
    }

    const labels = templateItems.value
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => item.label)

    if (currentVersionChecklistItems.value.length > 0) {
      checklistDraft.value = labels.map(label => {
        const item = currentVersionChecklistItems.value.find(entry => entry.label === label)
        return { label, passed: item?.passed ?? false, note: item?.note ?? '' }
      })
      return
    }

    checklistDraft.value = labels.map(label => ({ label, passed: false, note: '' }))
  }

  async function persistChecklist(showToast = false) {
    error.value = ''
    checklistItems.value = await checklistApi.submit(
      trackId.value,
      checklistDraft.value.map(item => ({
        label: item.label,
        passed: item.passed,
        note: item.note || undefined,
      })),
    )
    if (showToast) {
      toastSuccess(t('peerReview.checklistSubmitted'))
    }
    await reload()
  }

  async function submitChecklist() {
    try {
      await persistChecklist(true)
    } catch (err: any) {
      error.value = err.message || t('common.requestFailed')
    }
  }

  return {
    checklistItems,
    checklistDraft,
    checklistPrefill,
    albumChecklistEnabled,
    isPeerReviewChecklistEnabled,
    currentVersionChecklistItems,
    checklistDirty,
    checklistPassedCount,
    checklistSaved,
    checklistSaveButtonLabel,
    checklistPrefillStateLabel,
    checklistByReviewer,
    applyDetail,
    resetTemplate,
    resetForTrackChange,
    loadPeerChecklist,
    persistChecklist,
    submitChecklist,
  }
}
