import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'

import { createTestI18n } from '@/tests/utils'

vi.mock('@/api', () => ({
  masterDeliveryAudioUrl: (trackId: number, delivery: MasterDelivery) => `/api/tracks/${trackId}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}&t=${encodeURIComponent(delivery.created_at)}`,
  sourceVersionAudioUrl: (trackId: number, version: TrackSourceVersion) => `/api/tracks/${trackId}/source-versions/${version.id}/audio?v=${version.version_number}&c=${version.workflow_cycle}&t=${encodeURIComponent(version.created_at)}`,
}))

import { useVersionCompare } from './useVersionCompare'
import type { MasterDelivery, Track, TrackSourceVersion } from '@/types'

type Composable = ReturnType<typeof useVersionCompare>

function sourceVersion(id: number, versionNumber: number, overrides: Record<string, unknown> = {}): TrackSourceVersion {
  return {
    id,
    workflow_cycle: 1,
    version_number: versionNumber,
    file_path: `/v${versionNumber}.wav`,
    source_kind: 'file',
    duration: null,
    uploaded_by_id: 1,
    revision_notes: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as unknown as TrackSourceVersion
}

function delivery(id: number, deliveryNumber: number, cycle = 1): MasterDelivery {
  return {
    id,
    workflow_cycle: cycle,
    delivery_number: deliveryNumber,
    file_path: `/master-v${deliveryNumber}.wav`,
    confirmed_at: null,
    producer_approved_at: null,
    submitter_approved_at: null,
    created_at: '2024-01-01T00:00:00Z',
  } as unknown as MasterDelivery
}

function mountHarness(overrides: {
  track?: Partial<Track>
  sourceVersions?: TrackSourceVersion[]
  masterDeliveries?: MasterDelivery[]
  canAccessMasterAudio?: boolean
  canAccessMasterHistory?: boolean
} = {}) {
  let captured: Composable | null = null
  const track = ref<Track | null>({
    id: 9,
    version: 3,
    current_source_version: { id: 13 },
    current_master_delivery: null,
    ...overrides.track,
  } as unknown as Track)
  const sourceVersions = ref<TrackSourceVersion[]>(overrides.sourceVersions ?? [])
  const masterDeliveries = ref<MasterDelivery[]>(overrides.masterDeliveries ?? [])
  const canAccessMasterAudio = ref(overrides.canAccessMasterAudio ?? true)
  const canAccessMasterHistory = ref(overrides.canAccessMasterHistory ?? true)
  const Comp = defineComponent({
    setup() {
      captured = useVersionCompare({
        trackId: ref(9),
        track: track as Ref<Track | null>,
        sourceVersions,
        masterDeliveries,
        canAccessMasterAudio,
        canAccessMasterHistory,
      })
      return () => null
    },
  })
  const wrapper = mount(Comp, {
    global: { plugins: [createTestI18n()] },
  })
  return {
    wrapper,
    composable: captured as unknown as Composable,
    track,
    sourceVersions,
    masterDeliveries,
    canAccessMasterAudio,
    canAccessMasterHistory,
  }
}

describe('useVersionCompare', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds source compare options from older playable versions only', () => {
    const { composable, wrapper } = mountHarness({
      sourceVersions: [
        sourceVersion(13, 3),
        sourceVersion(12, 2),
        sourceVersion(11, 1),
        sourceVersion(10, 0, { source_kind: 'external_link', file_path: null }),
        sourceVersion(9, -1, { file_path: '' }),
        sourceVersion(8, -2, { file_path: null }),
        sourceVersion(7, -3, { file_path: undefined }),
      ],
    })

    expect(composable.olderPlayableSourceVersions.value.map(v => v.id)).toEqual([12, 11])
    expect(composable.sourceCompareOptions.value.map(o => o.value)).toEqual([12, 11])
    expect(composable.isSourceCompareActive.value).toBe(false)
    wrapper.unmount()
  })

  it('tracks the selected immutable source without defining issue-list membership', () => {
    const { composable, wrapper } = mountHarness({
      sourceVersions: [sourceVersion(13, 3), sourceVersion(12, 2)],
    })
    composable.selectedCompareSourceVersionId.value = 12
    expect(composable.isSourceCompareActive.value).toBe(true)
    expect(composable.selectedCompareSourceVersion.value?.id).toBe(12)
    expect(composable.selectedCompareSourceAudioUrl.value).toBe('/api/tracks/9/source-versions/12/audio?v=2&c=1&t=2024-01-01T00%3A00%3A00Z')
    composable.selectedCompareSourceVersionId.value = null
    expect(composable.selectedCompareSourceVersion.value).toBe(null)
    wrapper.unmount()
  })

  it('clears the source compare selection when toggled off or the list empties', async () => {
    const { composable, sourceVersions, wrapper } = mountHarness({
      sourceVersions: [sourceVersion(13, 3), sourceVersion(12, 2)],
    })

    composable.toggleSourceCompare()
    expect(composable.showSourceCompare.value).toBe(true)
    composable.selectedCompareSourceVersionId.value = 12

    composable.toggleSourceCompare()
    expect(composable.showSourceCompare.value).toBe(false)
    expect(composable.selectedCompareSourceVersionId.value).toBe(null)

    composable.showSourceCompare.value = true
    composable.selectedCompareSourceVersionId.value = 12
    sourceVersions.value = [sourceVersion(13, 3)]
    await nextTick()

    expect(composable.selectedCompareSourceVersionId.value).toBe(null)
    expect(composable.showSourceCompare.value).toBe(false)
    wrapper.unmount()
  })

  it('sorts master deliveries by cycle then number and excludes the current one', () => {
    const current = delivery(22, 3, 2)
    const { composable, wrapper } = mountHarness({
      track: { current_master_delivery: current } as Partial<Track>,
      masterDeliveries: [delivery(20, 1, 1), current, delivery(21, 2, 1)],
    })

    expect(composable.masterDelivery.value?.id).toBe(22)
    expect(composable.sortedMasterDeliveries.value.map(d => d.id)).toEqual([22, 21, 20])
    expect(composable.olderMasterDeliveries.value.map(d => d.id)).toEqual([21, 20])
    expect(composable.masterCompareOptions.value.map(o => o.value)).toEqual([21, 20])
    wrapper.unmount()
  })

  it('resolves the compare master audio url and resets when deliveries disappear', async () => {
    const current = delivery(22, 3, 2)
    const { composable, masterDeliveries, wrapper } = mountHarness({
      track: { current_master_delivery: current } as Partial<Track>,
      masterDeliveries: [current, delivery(21, 2, 1)],
    })

    composable.compareWithMasterDelivery(21)
    expect(composable.showMasterCompare.value).toBe(true)
    expect(composable.selectedCompareMasterDeliveryId.value).toBe(21)
    expect(composable.selectedCompareMasterAudioUrl.value).toBe('/api/tracks/9/master-deliveries/21/audio?v=2&c=1&t=2024-01-01T00%3A00%3A00Z')

    masterDeliveries.value = [current]
    await nextTick()

    expect(composable.selectedCompareMasterDeliveryId.value).toBe(null)
    expect(composable.showMasterCompare.value).toBe(false)
    wrapper.unmount()
  })

  it('ignores compare requests for deliveries without audio', () => {
    const current = delivery(22, 3, 2)
    const textOnly = { ...delivery(21, 2, 1), file_path: null }
    const { composable, wrapper } = mountHarness({
      track: { current_master_delivery: current } as Partial<Track>,
      masterDeliveries: [current, textOnly],
    })

    composable.compareWithMasterDelivery(21)
    expect(composable.showMasterCompare.value).toBe(false)
    expect(composable.selectedCompareMasterDeliveryId.value).toBe(null)
    wrapper.unmount()
  })

  it('builds the current master audio url from the current delivery', () => {
    const current = delivery(22, 3, 2)
    const { composable, wrapper } = mountHarness({
      track: { current_master_delivery: current } as Partial<Track>,
      masterDeliveries: [current],
    })

    expect(composable.masterAudioUrl.value).toBe('/api/tracks/9/master-deliveries/22/audio?v=3&c=2&t=2024-01-01T00%3A00%3A00Z')
    wrapper.unmount()
  })

  it('exposes only current final audio without participant history or comparison', () => {
    const current = delivery(22, 3, 2)
    const { composable, wrapper } = mountHarness({
      track: { current_master_delivery: current },
      masterDeliveries: [current, delivery(21, 2, 2), delivery(20, 1, 1)],
      canAccessMasterAudio: true,
      canAccessMasterHistory: false,
    })

    expect(composable.masterAudioUrl.value).toBe('/api/tracks/9/master-deliveries/22/audio?v=3&c=2&t=2024-01-01T00%3A00%3A00Z')
    expect(composable.sortedMasterDeliveries.value).toEqual([])
    expect(composable.masterCompareOptions.value).toEqual([])
    composable.compareWithMasterDelivery(21)
    expect(composable.selectedCompareMasterAudioUrl.value).toBe('')
    expect(composable.showMasterCompare.value).toBe(false)
    wrapper.unmount()
  })

  it('withholds master data and urls from active nonparticipants even if an older payload contains deliveries', () => {
    const current = delivery(22, 3, 2)
    const { composable, wrapper } = mountHarness({
      track: { current_master_delivery: current },
      masterDeliveries: [current, delivery(21, 2, 1)],
      canAccessMasterAudio: false,
      canAccessMasterHistory: false,
    })

    expect(composable.masterDelivery.value).toBe(null)
    expect(composable.masterAudioUrl.value).toBe('')
    expect(composable.sortedMasterDeliveries.value).toEqual([])
    composable.selectedCompareMasterDeliveryId.value = 21
    expect(composable.selectedCompareMasterAudioUrl.value).toBe('')
    wrapper.unmount()
  })

  it('clears historical comparison when participant access is revoked', async () => {
    const current = delivery(22, 3, 2)
    const { composable, canAccessMasterHistory, wrapper } = mountHarness({
      track: { current_master_delivery: current },
      masterDeliveries: [current, delivery(21, 2, 1)],
    })
    composable.compareWithMasterDelivery(21)

    canAccessMasterHistory.value = false
    await nextTick()

    expect(composable.showMasterCompare.value).toBe(false)
    expect(composable.selectedCompareMasterDeliveryId.value).toBe(null)
    expect(composable.selectedCompareMasterAudioUrl.value).toBe('')
    expect(composable.masterAudioUrl.value).toBe('/api/tracks/9/master-deliveries/22/audio?v=3&c=2&t=2024-01-01T00%3A00%3A00Z')
    wrapper.unmount()
  })
})
