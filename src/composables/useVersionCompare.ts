import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { masterDeliveryAudioUrl, sourceVersionAudioUrl } from '@/api'
import type { MasterDelivery, Track, TrackSourceVersion } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { formatMasterDeliveryOptionLabel, formatSourceVersionOptionLabel } from '@/utils/sourceVersions'
import type { SelectOption } from '@/components/common/CustomSelect.vue'

export interface UseVersionCompareOptions {
  trackId: Ref<number>
  track: Ref<Track | null>
  sourceVersions: Ref<TrackSourceVersion[]>
  masterDeliveries: Ref<MasterDelivery[]>
  canAccessMasterAudio: Ref<boolean>
  canAccessMasterHistory: Ref<boolean>
}

/**
 * Shared source-version / master-delivery comparison state for the track
 * workspaces (workflow step page and mastering page): which historical version
 * is selected for A/B compare, dropdown options and technical-data labels,
 * and reset watchers that clear selections when the underlying lists change.
 */
export function useVersionCompare({
  trackId,
  track,
  sourceVersions,
  masterDeliveries,
  canAccessMasterAudio,
  canAccessMasterHistory,
}: UseVersionCompareOptions) {
  const { t, locale } = useI18n()
  const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

  // ── Source version compare ─────────────────────────────────────────────
  const showSourceCompare = ref(false)
  const selectedCompareSourceVersionId = ref<number | null>(null)

  const currentSourceVersionId = computed(() => track.value?.current_source_version?.id ?? null)
  const olderSourceVersions = computed(() =>
    sourceVersions.value
      .filter(version => version.id !== currentSourceVersionId.value)
      .sort((a, b) => b.version_number - a.version_number),
  )
  const olderPlayableSourceVersions = computed(() =>
    olderSourceVersions.value.filter(version => version.source_kind !== 'external_link' && Boolean(version.file_path)),
  )
  const sourceCompareOptions = computed<SelectOption[]>(() =>
    olderPlayableSourceVersions.value.map((version) => ({
      value: version.id,
      label: formatSourceVersionOptionLabel(version, t, fmtDate),
    })),
  )
  const selectedCompareSourceVersion = computed(() =>
    olderPlayableSourceVersions.value.find(version => version.id === selectedCompareSourceVersionId.value) ?? null,
  )
  const isSourceCompareActive = computed(() => selectedCompareSourceVersion.value !== null)
  const selectedCompareSourceAudioUrl = computed(() => selectedCompareSourceVersion.value
    ? sourceVersionAudioUrl(trackId.value, selectedCompareSourceVersion.value) : '')

  function toggleSourceCompare() {
    showSourceCompare.value = !showSourceCompare.value
    if (!showSourceCompare.value) {
      selectedCompareSourceVersionId.value = null
    }
  }


  watch(olderPlayableSourceVersions, (versions) => {
    if (!versions.some(version => version.id === selectedCompareSourceVersionId.value)) {
      selectedCompareSourceVersionId.value = null
    }
    if (versions.length === 0) {
      showSourceCompare.value = false
    }
  })

  // ── Master delivery compare ────────────────────────────────────────────
  const showMasterCompare = ref(false)
  const selectedCompareMasterDeliveryId = ref<number | null>(null)

  const masterDelivery = computed<MasterDelivery | null>(() =>
    canAccessMasterAudio.value || canAccessMasterHistory.value
      ? track.value?.current_master_delivery ?? null
      : null,
  )
  const masterAudioUrl = computed(() => {
    const d = masterDelivery.value
    if (!canAccessMasterAudio.value || !d?.file_path) return ''
    return masterDeliveryAudioUrl(trackId.value, d)
  })
  const sortedMasterDeliveries = computed(() =>
    [...(canAccessMasterHistory.value ? masterDeliveries.value : [])].sort((a, b) => {
      if (a.workflow_cycle !== b.workflow_cycle) return b.workflow_cycle - a.workflow_cycle
      return b.delivery_number - a.delivery_number
    }),
  )
  const olderMasterDeliveries = computed(() => {
    const currentId = masterDelivery.value?.id ?? null
    return sortedMasterDeliveries.value.filter(delivery => delivery.id !== currentId)
  })
  const olderPlayableMasterDeliveries = computed(() =>
    olderMasterDeliveries.value.filter(delivery => Boolean(delivery.file_path)),
  )
  const masterCompareOptions = computed<SelectOption[]>(() =>
    olderPlayableMasterDeliveries.value.map((delivery) => ({
      value: delivery.id,
      label: masterDeliveryOptionLabel(delivery),
    })),
  )
  const selectedCompareMasterDelivery = computed(() =>
    olderMasterDeliveries.value.find(delivery => delivery.id === selectedCompareMasterDeliveryId.value) ?? null,
  )
  const selectedCompareMasterAudioUrl = computed(() => {
    const delivery = selectedCompareMasterDelivery.value
    if (!canAccessMasterAudio.value || !delivery?.file_path) return ''
    return masterDeliveryAudioUrl(trackId.value, delivery)
  })

  function masterDeliveryOptionLabel(delivery: MasterDelivery) {
    return formatMasterDeliveryOptionLabel(delivery, fmtDate)
  }

  function toggleMasterCompare() {
    showMasterCompare.value = !showMasterCompare.value
    if (!showMasterCompare.value) {
      selectedCompareMasterDeliveryId.value = null
    }
  }

  function compareWithMasterDelivery(deliveryId: number) {
    const delivery = olderMasterDeliveries.value.find(item => item.id === deliveryId)
    if (!delivery?.file_path) return
    showMasterCompare.value = true
    selectedCompareMasterDeliveryId.value = deliveryId
  }

  watch(olderMasterDeliveries, (deliveries) => {
    if (!deliveries.some(delivery => delivery.id === selectedCompareMasterDeliveryId.value)) {
      selectedCompareMasterDeliveryId.value = null
    }
    if (deliveries.length === 0) {
      showMasterCompare.value = false
    }
  })

  return {
    // source compare
    showSourceCompare,
    selectedCompareSourceVersionId,
    currentSourceVersionId,
    olderSourceVersions,
    olderPlayableSourceVersions,
    sourceCompareOptions,
    selectedCompareSourceVersion,
    selectedCompareSourceAudioUrl,
    isSourceCompareActive,
    toggleSourceCompare,
    // master compare
    showMasterCompare,
    selectedCompareMasterDeliveryId,
    masterDelivery,
    masterAudioUrl,
    sortedMasterDeliveries,
    olderMasterDeliveries,
    olderPlayableMasterDeliveries,
    masterCompareOptions,
    selectedCompareMasterDelivery,
    selectedCompareMasterAudioUrl,
    masterDeliveryOptionLabel,
    toggleMasterCompare,
    compareWithMasterDelivery,
  }
}
