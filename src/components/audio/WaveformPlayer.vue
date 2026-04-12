<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Play, Pause, Headphones, MapPin } from 'lucide-vue-next'
import type { Issue, IssueMarker } from '@/types'
import type WaveSurfer from 'wavesurfer.js'
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import { resolveAssetUrl } from '@/api'
import { useTrackPlaybackPreference } from '@/composables/useTrackPlaybackPreference'
import { useAppStore } from '@/stores/app'
import { formatTimestamp, formatTimestampShort, roundToMilliseconds } from '@/utils/time'
import { loadAudioCached } from '@/utils/audioCache'

type InteractionMode = 'seek' | 'annotate'
type PlaybackScope = 'source' | 'master' | 'local'

const props = withDefaults(defineProps<{
  audioUrl: string
  issues?: Issue[]
  height?: number
  gainDb?: number
  showGainControl?: boolean
  playbackScope?: PlaybackScope
  selectable?: boolean
  mode?: InteractionMode
  selectedRange?: { start: number; end: number } | null
  compareVersionId?: number | null
  compareAudioUrl?: string
  trackId?: number
  draftMarkers?: { marker_type: 'point' | 'range'; time_start: number; time_end: number | null }[]
  draftRangeAnchor?: number | null
  hoveredIssueId?: number | null
  compact?: boolean
}>(), {
  mode: 'seek',
  showGainControl: true,
  playbackScope: 'source',
  compact: false,
})

const emit = defineEmits<{
  ready: [duration: number]
  timeupdate: [time: number]
  'update:gainDb': [gainDb: number]
  click: [time: number]
  regionClick: [issue: Issue]
  rangeSelect: [start: number, end: number, isUpdate: boolean]
  issueHover: [issue: Issue]
  issueLeave: []
  requestModeChange: [mode: InteractionMode]
}>()

const { t } = useI18n()
const appStore = useAppStore()

const container = ref<HTMLDivElement>()
const compareContainerRef = ref<HTMLDivElement>()
const wavesurfer = ref<WaveSurfer | null>(null)
const compareWaveSurfer = ref<WaveSurfer | null>(null)
const audioContext = ref<AudioContext | null>(null)
const primarySourceNode = ref<MediaElementAudioSourceNode | null>(null)
const primaryUserGainNode = ref<GainNode | null>(null)
const primaryGateGainNode = ref<GainNode | null>(null)
const compareSourceNode = ref<MediaElementAudioSourceNode | null>(null)
const compareUserGainNode = ref<GainNode | null>(null)
const compareGateGainNode = ref<GainNode | null>(null)
const regionsPlugin = ref<RegionsPlugin | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isPrimaryLoading = ref(false)
const primaryLoadProgress = ref(0)
const isRenderingRegions = ref(false)
const selectionRegionId = ref<string | null>(null)
const highlightRegionIds = ref<string[]>([])
const activeRangeIssueId = ref<number | null>(null)
const lastSelectionAt = ref(0)
const lastEmittedSelection = ref<{ id: string; start: number; end: number } | null>(null)
const activePointGroupKey = ref<string | null>(null)
const hoveredRangeKey = ref<string | null>(null)
// Only show tooltip on direct bar hover (one at a time) to prevent overlap.
// External hover / active issue just highlights bars visually — time info is
// already visible in the waveform header and issue detail header.
const visibleRangeTooltipKeys = computed<Set<string>>(() => {
  const keys = new Set<string>()
  if (hoveredRangeKey.value) {
    keys.add(hoveredRangeKey.value)
  }
  return keys
})
const abMode = ref<'A' | 'B'>('A')
const hoverTime = ref<number | null>(null)
const hoverLeft = ref<number>(0)
const compareSourceUrl = computed(() => {
  if (props.compareAudioUrl) return props.compareAudioUrl
  if (props.compareVersionId && props.trackId) {
    return resolveAssetUrl(`/api/tracks/${props.trackId}/source-versions/${props.compareVersionId}/audio`)
  }
  return ''
})
const isCompareMode = computed(() => !!compareSourceUrl.value)
const isCompareLoading = ref(false)
const compareLoadProgress = ref(0)
const isCompareReady = ref(false)
const compareDuration = ref(0)
const compareCurrentTime = ref(0)
const activeDuration = computed(() => abMode.value === 'B' && compareDuration.value > 0 ? compareDuration.value : duration.value)
const activeCurrentTime = computed(() => abMode.value === 'B' && compareDuration.value > 0 ? compareCurrentTime.value : currentTime.value)
const markerTimelineDuration = computed(() => activeDuration.value)
// Draft (currently-being-edited) markers use the primary orange with a dashed
// edge — distinct from the solid "major" severity even though they share hue.
const DRAFT_EDGE = '#FF8400'
const DRAFT_FILL = 'rgba(255, 132, 0, 0.22)'
const selectionVisualColor = DRAFT_FILL
const MIN_GAIN_DB = -24
const MAX_GAIN_DB = 24
const localGainDb = ref(0)
const playbackScope = computed<PlaybackScope>(() => props.playbackScope)
const hasTrackPreference = computed(() => playbackScope.value !== 'local' && props.trackId != null)
const controlledGainDb = computed(() => props.gainDb)
const persistedGainPreference = useTrackPlaybackPreference({
  trackId: () => props.trackId ?? null,
  userId: () => appStore.currentUser?.id ?? null,
  enabled: () => props.showGainControl && hasTrackPreference.value,
  scope: () => playbackScope.value === 'master' ? 'master' : 'source',
})
const gainDb = computed(() => {
  if (controlledGainDb.value != null) return clampGainDb(controlledGainDb.value)
  if (hasTrackPreference.value) return clampGainDb(persistedGainPreference.gainDb.value)
  return clampGainDb(localGainDb.value)
})
const hasActiveGain = computed(() => Math.abs(gainDb.value) >= 0.05)

// Severity tones — all values sourced from the design system tokens in
// CLAUDE.md (error / primary / info / muted-foreground).
const RANGE_TONES: Record<string, { edge: string; fill: string; soft: string; glow: string }> = {
  critical: {
    edge: '#FF5C33',
    fill: 'rgba(255, 92, 51, 0.78)',
    soft: 'rgba(255, 92, 51, 0.30)',
    glow: 'rgba(255, 92, 51, 0.22)',
  },
  major: {
    edge: '#FF8400',
    fill: 'rgba(255, 132, 0, 0.78)',
    soft: 'rgba(255, 132, 0, 0.28)',
    glow: 'rgba(255, 132, 0, 0.22)',
  },
  minor: {
    edge: '#B2B2FF',
    fill: 'rgba(178, 178, 255, 0.70)',
    soft: 'rgba(178, 178, 255, 0.24)',
    glow: 'rgba(178, 178, 255, 0.20)',
  },
  suggestion: {
    edge: '#B8B9B6',
    fill: 'rgba(184, 185, 182, 0.62)',
    soft: 'rgba(184, 185, 182, 0.22)',
    glow: 'rgba(184, 185, 182, 0.18)',
  },
}

const RESOLVED_TONE = {
  edge: '#B6FFCE',
  fill: 'rgba(182, 255, 206, 0.58)',
  soft: 'rgba(182, 255, 206, 0.22)',
  glow: 'rgba(182, 255, 206, 0.18)',
}

type MarkerStatus = 'unresolved' | 'resolved'

interface PointMarkerGroup {
  key: string
  time: number
  percent: number
  left: string
  issues: Issue[]
  status: MarkerStatus
  markerAlign: 'left' | 'center' | 'right'
  popoverAlign: 'left' | 'center' | 'right'
}

interface MarkerWithIssue {
  marker: IssueMarker
  issue: Issue
}

interface RangeLaneItem {
  marker: IssueMarker & { time_end: number }
  issue: Issue
  lane: number
}


function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function clampGainDb(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, Math.round(value * 10) / 10))
}

function gainDbToLinear(value: number): number {
  return Math.pow(10, value / 20)
}

function isIssueUnresolved(status: string): boolean {
  return status === 'open' || status === 'pending_discussion' || status === 'disagreed'
}

function isIssueResolvedLike(status: string): boolean {
  return status === 'resolved' || status === 'internal_resolved'
}

function getMarkerStatus(issues: Issue[]): MarkerStatus {
  return issues.every(issue => !isIssueUnresolved(issue.status)) ? 'resolved' : 'unresolved'
}

function getMarkerPosition(time: number): string {
  if (markerTimelineDuration.value <= 0) return '0%'
  return `${clampPercent((time / markerTimelineDuration.value) * 100)}%`
}

function getMarkerPercent(time: number): number {
  if (markerTimelineDuration.value <= 0) return 0
  return clampPercent((time / markerTimelineDuration.value) * 100)
}

function getPointMarkerAlign(percent: number): 'left' | 'center' | 'right' {
  if (percent <= 3) return 'left'
  if (percent >= 97) return 'right'
  return 'center'
}

function getPointPopoverAlign(percent: number): 'left' | 'center' | 'right' {
  if (percent <= 12) return 'left'
  if (percent >= 88) return 'right'
  return 'center'
}

function markerAnchorClass(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'translate-x-0'
  if (align === 'right') return '-translate-x-full'
  return '-translate-x-1/2'
}

function popoverAnchorClass(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'left-0 translate-x-0'
  if (align === 'right') return 'right-0 translate-x-0'
  return 'left-1/2 -translate-x-1/2'
}

function getRangeWidth(start: number, end: number): string {
  if (markerTimelineDuration.value <= 0) return '0%'
  const width = ((Math.max(end, start) - start) / markerTimelineDuration.value) * 100
  return `${Math.max(clampPercent(width), 0.35)}%`
}

const pointGroups = computed<PointMarkerGroup[]>(() => {
  if (!props.issues?.length || markerTimelineDuration.value <= 0) return []

  // Flatten: each point marker → its parent issue (an issue can appear in multiple groups)
  const grouped = new Map<number, Map<number, Issue>>()
  for (const issue of props.issues) {
    for (const marker of issue.markers) {
      if (marker.marker_type !== 'point') continue
      const key = Math.round(marker.time_start * 1000)
      if (!grouped.has(key)) grouped.set(key, new Map())
      grouped.get(key)!.set(issue.id, issue)
    }
  }

  return Array.from(grouped.entries())
    .map(([key, issueMap]) => {
      const time = key / 1000
      const percent = getMarkerPercent(time)
      const issues = [...issueMap.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return {
        key: String(key),
        time,
        percent,
        left: `${percent}%`,
        issues,
        status: getMarkerStatus(issues),
        markerAlign: getPointMarkerAlign(percent),
        popoverAlign: getPointPopoverAlign(percent),
      }
    })
    .sort((a, b) => a.time - b.time)
})

// Flatten all range markers with their parent issue
const rangeMarkerItems = computed<MarkerWithIssue[]>(() => {
  const items: MarkerWithIssue[] = []
  for (const issue of props.issues ?? []) {
    for (const marker of issue.markers) {
      if (marker.marker_type === 'range' && marker.time_end !== null) {
        items.push({ marker, issue })
      }
    }
  }
  return items
})

const rangeLaneItems = computed<RangeLaneItem[]>(() => {
  const laneEnds: number[] = []

  return [...rangeMarkerItems.value]
    .sort((a, b) => a.marker.time_start - b.marker.time_start || a.marker.time_end! - b.marker.time_end!)
    .map(({ marker, issue }) => {
      const m = marker as IssueMarker & { time_end: number }
      let lane = laneEnds.findIndex(end => m.time_start >= end)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(m.time_end)
      } else {
        laneEnds[lane] = m.time_end
      }

      return { marker: m, issue, lane }
    })
})

const rangeLaneCount = computed(() =>
  rangeLaneItems.value.reduce((max, item) => Math.max(max, item.lane + 1), 0),
)

const draftPointList = computed(() => {
  if (!props.draftMarkers?.length || markerTimelineDuration.value <= 0) return []
  return props.draftMarkers
    .filter(m => m.marker_type === 'point')
    .map((m, i) => ({
      index: i + 1,
      time: m.time_start,
      left: getMarkerPosition(m.time_start),
    }))
})

const draftRangeList = computed(() => {
  if (!props.draftMarkers?.length || markerTimelineDuration.value <= 0) return []
  return props.draftMarkers
    .filter(m => m.marker_type === 'range' && m.time_end !== null)
    .map((m, i) => ({
      index: i + 1,
      time_start: m.time_start,
      time_end: m.time_end!,
    }))
})

const draftRangeAnchorLeft = computed(() => {
  if (props.draftRangeAnchor == null || markerTimelineDuration.value <= 0) return null
  return getMarkerPosition(props.draftRangeAnchor)
})

const overlayHeight = computed(() => props.height || 128)

const hasPointIssues = computed(() => (props.issues ?? []).some(i => i.markers.some(m => m.marker_type === 'point')))
const hasRangeIssues = computed(() => rangeLaneItems.value.length > 0)
const rangeRulerHeight = computed(() => Math.max(rangeLaneCount.value, 1) * 6)


function togglePointGroup(groupKey: string) {
  activePointGroupKey.value = activePointGroupKey.value === groupKey ? null : groupKey
}

function selectIssue(issue: Issue) {
  activePointGroupKey.value = null
  emit('regionClick', issue)
}

// Dominant severity wins when multiple issues share the same timestamp.
const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  suggestion: 1,
}

function dominantSeverity(issues: Issue[]): string {
  return issues.reduce((acc, issue) => (
    (SEVERITY_ORDER[issue.severity] ?? 0) > (SEVERITY_ORDER[acc] ?? 0) ? issue.severity : acc
  ), issues[0]?.severity ?? 'major')
}

function pointGroupTone(group: PointMarkerGroup) {
  if (group.status === 'resolved') return RESOLVED_TONE
  return rangeTone(dominantSeverity(group.issues))
}

function pointGroupDotStyle(group: PointMarkerGroup) {
  const tone = pointGroupTone(group)
  const hovered = group.issues.some(issue => issue.id === props.hoveredIssueId)
  return {
    background: tone.edge,
    boxShadow: hovered ? `0 0 0 2px ${tone.soft}, 0 0 6px ${tone.glow}` : `0 0 0 1px rgba(0,0,0,0.4)`,
    transform: hovered ? 'scale(1.2)' : 'scale(1)',
  }
}

function pointGroupLineStyle(group: PointMarkerGroup) {
  const tone = pointGroupTone(group)
  const hovered = group.issues.some(issue => issue.id === props.hoveredIssueId)
  return {
    background: hovered ? tone.edge : tone.fill,
    opacity: group.status === 'resolved' && !hovered ? '0.45' : '0.85',
  }
}

function rangeTone(severity: string) {
  return RANGE_TONES[severity] ?? RANGE_TONES.major
}

function rangeRulerBarStyle(issue: Issue) {
  const tone = isIssueResolvedLike(issue.status) ? RESOLVED_TONE : rangeTone(issue.severity)
  const isActive = activeRangeIssueId.value === issue.id
  const isHovered = props.hoveredIssueId === issue.id

  return {
    background: isActive || isHovered ? tone.fill : tone.soft,
    borderBottom: `2px solid ${tone.edge}`,
    boxShadow: isHovered ? `0 0 0 1px ${tone.edge} inset, 0 0 8px ${tone.glow}` : 'none',
  }
}

function rangeRulerTooltipStyle(issue: Issue) {
  const tone = isIssueResolvedLike(issue.status) ? RESOLVED_TONE : rangeTone(issue.severity)
  return {
    borderColor: tone.edge,
    boxShadow: '0 4px 12px rgba(0,0,0,0.32)',
  }
}

function rangeLaneOffset(lane: number): string {
  return `${lane * 6}px`
}

function rangeTooltipAlignClass(item: RangeLaneItem): string {
  const midPercent = getMarkerPercent((item.marker.time_start + item.marker.time_end) / 2)
  if (midPercent <= 12) return 'left-0'
  if (midPercent >= 88) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

function onWaveformPointerMove(event: PointerEvent) {
  if (markerTimelineDuration.value <= 0) return
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  hoverTime.value = (x / rect.width) * markerTimelineDuration.value
  hoverLeft.value = x
}

function onWaveformPointerLeave() {
  hoverTime.value = null
}

function setMode(mode: InteractionMode) {
  if (mode === props.mode) return
  emit('requestModeChange', mode)
}

function ensureAudioContext(): AudioContext | null {
  if (audioContext.value) return audioContext.value

  const AudioContextCtor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return null

  audioContext.value = new AudioContextCtor()
  return audioContext.value
}

async function resumeAudioContext() {
  const ctx = ensureAudioContext()
  if (!ctx || ctx.state !== 'suspended') return
  try {
    await ctx.resume()
  } catch {
    // Ignore resume errors and let HTMLMediaElement playback continue.
  }
}

function disconnectGraph(kind: 'primary' | 'compare') {
  const sourceNode = kind === 'primary' ? primarySourceNode : compareSourceNode
  const userGainNode = kind === 'primary' ? primaryUserGainNode : compareUserGainNode
  const gateGainNode = kind === 'primary' ? primaryGateGainNode : compareGateGainNode

  sourceNode.value?.disconnect()
  userGainNode.value?.disconnect()
  gateGainNode.value?.disconnect()
  sourceNode.value = null
  userGainNode.value = null
  gateGainNode.value = null
}

function setNodeGain(node: GainNode | null, value: number) {
  if (!node) return
  const ctx = audioContext.value
  if (!ctx) {
    node.gain.value = value
    return
  }
  node.gain.setTargetAtTime(value, ctx.currentTime, 0.01)
}

function applyUserGain() {
  const linearGain = gainDbToLinear(gainDb.value)
  setNodeGain(primaryUserGainNode.value, linearGain)
  setNodeGain(compareUserGainNode.value, linearGain)
}

function attachGainGraph(instance: WaveSurfer, kind: 'primary' | 'compare') {
  disconnectGraph(kind)

  const ctx = ensureAudioContext()
  const mediaElement = instance.getMediaElement?.()
  if (!ctx || !mediaElement) return

  const source = ctx.createMediaElementSource(mediaElement)
  const userGain = ctx.createGain()
  const gateGain = ctx.createGain()
  source.connect(userGain)
  userGain.connect(gateGain)
  gateGain.connect(ctx.destination)

  if (kind === 'primary') {
    primarySourceNode.value = source
    primaryUserGainNode.value = userGain
    primaryGateGainNode.value = gateGain
  } else {
    compareSourceNode.value = source
    compareUserGainNode.value = userGain
    compareGateGainNode.value = gateGain
  }

  applyUserGain()
  applyCompareMode(abMode.value)
}

function applyCompareMode(mode: 'A' | 'B') {
  if (!wavesurfer.value) return

  if (!compareWaveSurfer.value || !isCompareReady.value) {
    wavesurfer.value.setVolume(1)
    setNodeGain(primaryGateGainNode.value, 1)
    setNodeGain(compareGateGainNode.value, 0)
    wavesurfer.value.setOptions({ waveColor: '#4A4A5A', progressColor: '#22D3EE', cursorWidth: 2 })
    return
  }

  if (mode === 'A') {
    wavesurfer.value.setVolume(1)
    compareWaveSurfer.value.setVolume(0)
    setNodeGain(primaryGateGainNode.value, 1)
    setNodeGain(compareGateGainNode.value, 0)
    wavesurfer.value.setOptions({ waveColor: '#4A4A5A', progressColor: '#22D3EE', cursorWidth: 2 })
    compareWaveSurfer.value.setOptions({ waveColor: 'rgba(249,115,22,0.15)', progressColor: 'rgba(249,115,22,0.2)', cursorWidth: 0 })
    // Keep compare playing in sync so switching back to B is instant
    if (wavesurfer.value.isPlaying() && !compareWaveSurfer.value.isPlaying()) {
      syncCompareToPrimaryTime()
      compareWaveSurfer.value.play()
    }
    return
  }

  syncCompareToPrimaryTime()
  wavesurfer.value.setVolume(0)
  compareWaveSurfer.value.setVolume(1)
  setNodeGain(primaryGateGainNode.value, 0)
  setNodeGain(compareGateGainNode.value, 1)
  wavesurfer.value.setOptions({ waveColor: 'rgba(74,74,90,0.15)', progressColor: 'rgba(34,211,238,0.2)', cursorWidth: 0 })
  compareWaveSurfer.value.setOptions({ waveColor: 'rgba(249,115,22,0.28)', progressColor: '#FB923C', cursorWidth: 0 })
  // Ensure compare is actually playing when primary is playing
  if (wavesurfer.value.isPlaying() && !compareWaveSurfer.value.isPlaying()) {
    syncCompareToPrimaryTime()
    compareWaveSurfer.value.play()
  }
}

function syncCompareToPrimaryTime(time = wavesurfer.value?.getCurrentTime() ?? 0) {
  if (!compareWaveSurfer.value) return

  const compDur = compareWaveSurfer.value.getDuration()
  if (compDur <= 0) return

  const targetTime = Math.min(Math.max(time, 0), compDur)
  compareWaveSurfer.value.seekTo(targetTime / compDur)
}

function syncPrimaryToCompareTime(time: number) {
  if (!wavesurfer.value || duration.value <= 0) return

  const targetTime = Math.min(Math.max(time, 0), duration.value)
  wavesurfer.value.seekTo(targetTime / duration.value)
}

// Drag-to-select is only active in annotate mode. We call this on mount and
// whenever `selectable`/`mode` changes to keep wavesurfer in sync.
let disableDragSelectionFn: (() => void) | null = null
function applyDragSelection() {
  if (disableDragSelectionFn) {
    disableDragSelectionFn()
    disableDragSelectionFn = null
  }
  if (!regionsPlugin.value) return
  if (!props.selectable) return
  if (props.mode !== 'annotate') return
  const result = (regionsPlugin.value as any).enableDragSelection?.({
    color: selectionVisualColor,
    drag: true,
    resize: true,
  })
  if (typeof result === 'function') {
    disableDragSelectionFn = result
  }
}

function _removeRegionById(id: string) {
  const region = (regionsPlugin.value as any)?.getRegions?.()?.find(
    (r: { id: string; remove?: () => void }) => r.id === id,
  )
  region?.remove?.()
}

function _addHighlightRegion(issue: Issue, start: number, end: number) {
  if (!regionsPlugin.value) return
  const tone = isIssueResolvedLike(issue.status) ? RESOLVED_TONE : rangeTone(issue.severity)
  const region = regionsPlugin.value.addRegion({
    start,
    end,
    color: tone.soft,
    drag: false,
    resize: false,
    id: `__hl_${issue.id}_${Math.round(start * 1000)}_${Math.round(end * 1000)}__`,
  })
  const el = (region as any).element as HTMLElement | undefined
  if (el) el.style.pointerEvents = 'none'
  highlightRegionIds.value.push(region.id)
}

function highlightIssue(issue: Issue | null) {
  const hasRange = issue?.markers.some(m => m.marker_type === 'range' && m.time_end !== null)
  const newId = hasRange ? issue!.id : null
  activeRangeIssueId.value = activeRangeIssueId.value === newId ? null : newId

  for (const id of highlightRegionIds.value) {
    _removeRegionById(id)
  }
  highlightRegionIds.value = []

  if (activeRangeIssueId.value !== null) {
    const target = props.issues?.find(i => i.id === activeRangeIssueId.value)
    if (target) {
      for (const m of target.markers) {
        if (m.marker_type === 'range' && m.time_end !== null) {
          _addHighlightRegion(target, m.time_start, m.time_end)
        }
      }
    }
  }
}

function handleTimelineClick(issue: Issue) {
  const firstMarker = issue.markers[0]
  if (firstMarker) seekTo(firstMarker.time_start)
  emit('regionClick', issue)  // parent's onIssueSelect will call highlightIssue
}

function emitIssueHover(issue: Issue) {
  emit('issueHover', issue)
}

function emitIssueLeave() {
  emit('issueLeave')
}

function onRangeLaneMouseEnter(item: RangeLaneItem) {
  hoveredRangeKey.value = `${item.issue.id}-${item.marker.id}`
  emitIssueHover(item.issue)
}

function onRangeLaneMouseLeave() {
  hoveredRangeKey.value = null
  emitIssueLeave()
}

function emitPointGroupHover(group: PointMarkerGroup) {
  if (group.issues.length === 1) {
    emit('issueHover', group.issues[0])
  }
}

function syncSelectedRange(region: { id: string; start: number; end: number; remove?: () => void }, isUpdate = false) {
  const start = roundToMilliseconds(Math.min(region.start, region.end))
  const end = roundToMilliseconds(Math.max(region.start, region.end))

  if (end <= start) {
    region.remove?.()
    return
  }

  if (selectionRegionId.value && selectionRegionId.value !== region.id) {
    const previousRegion = (regionsPlugin.value as any)?.getRegions?.().find(
      (item: { id: string; remove?: () => void }) => item.id === selectionRegionId.value,
    )
    previousRegion?.remove?.()
  }

  selectionRegionId.value = region.id
  const prev = lastEmittedSelection.value
  if (prev && prev.id === region.id && prev.start === start && prev.end === end) {
    return
  }

  lastEmittedSelection.value = { id: region.id, start, end }
  lastSelectionAt.value = Date.now()
  emit('rangeSelect', start, end, isUpdate)

  // After the parent processes the event, re-sync the selection region.
  // This handles cases where the parent rejects the range (e.g. micro-drag
  // below the minimum duration) or toggles off a non-last range marker,
  // leaving selectedRange unchanged so the watcher never fires.
  nextTick(renderSelectionRegion)
}

function renderSelectionRegion() {
  if (!regionsPlugin.value) return
  const selectedRange = props.selectedRange

  if (!selectedRange) {
    if (selectionRegionId.value) {
      _removeRegionById(selectionRegionId.value)
      selectionRegionId.value = null
    }
    lastEmittedSelection.value = null
    return
  }

  const start = roundToMilliseconds(Math.min(selectedRange.start, selectedRange.end))
  const end = roundToMilliseconds(Math.max(selectedRange.start, selectedRange.end))

  // If a region already exists, keep it only when bounds still match (drag/resize
  // events update it in-place). When the prop points to a *different* range
  // (e.g. after a marker was deleted), remove the stale region and recreate.
  if (selectionRegionId.value) {
    if (lastEmittedSelection.value
      && lastEmittedSelection.value.start === start
      && lastEmittedSelection.value.end === end) {
      return
    }
    _removeRegionById(selectionRegionId.value)
    selectionRegionId.value = null
    lastEmittedSelection.value = null
  }

  if (end <= start) return

  // Suppress region-created → syncSelectedRange during programmatic addRegion.
  // Without this guard, syncSelectedRange would emit rangeSelect(start, end, false),
  // which calls handleRangeSelect and accidentally toggle-removes the marker we
  // are trying to highlight.
  const prevRendering = isRenderingRegions.value
  isRenderingRegions.value = true
  const region = regionsPlugin.value.addRegion({
    start,
    end,
    drag: true,
    resize: true,
    color: selectionVisualColor,
    id: '__draft_range__',
  })
  isRenderingRegions.value = prevRendering

  const element = (region as any).element as HTMLElement | undefined
  if (element) {
    element.style.outline = `2px dashed ${DRAFT_EDGE}`
    element.style.outlineOffset = '-2px'
    element.style.boxShadow = 'inset 0 0 0 1px rgba(255, 132, 0, 0.28)'
    element.style.borderTop = `2px solid ${DRAFT_EDGE}`
    element.style.borderBottom = `2px solid ${DRAFT_EDGE}`
  }

  selectionRegionId.value = region.id
  lastEmittedSelection.value = {
    id: region.id,
    start,
    end,
  }
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

function formatGainDb(value: number): string {
  const normalized = clampGainDb(value)
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1)} dB`
}

function updateGainDb(nextGainDb: number) {
  const next = clampGainDb(nextGainDb)
  if (controlledGainDb.value != null) {
    emit('update:gainDb', next)
    return
  }
  if (hasTrackPreference.value) {
    persistedGainPreference.setGainDb(next)
    return
  }
  localGainDb.value = next
}

function resetGain() {
  updateGainDb(0)
}

async function setAbMode(mode: 'A' | 'B') {
  await resumeAudioContext()
  abMode.value = mode
}

function onGainInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  updateGainDb(Number(target?.value ?? 0))
}

function formatTimeShort(seconds: number): string {
  return formatTimestampShort(seconds)
}

function updatePrimaryLoading(percent: number) {
  isPrimaryLoading.value = percent < 100
  primaryLoadProgress.value = Math.min(100, Math.max(0, Math.round(percent)))
}

function updateCompareLoading(percent: number) {
  isCompareLoading.value = percent < 100
  compareLoadProgress.value = Math.min(100, Math.max(0, Math.round(percent)))
}

onMounted(async () => {
  if (!container.value) return

  const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
    import('wavesurfer.js'),
    import('wavesurfer.js/dist/plugins/regions.js'),
  ])

  const regions = RegionsPlugin.create()
  regionsPlugin.value = regions

  const ws = WaveSurfer.create({
    container: container.value,
    waveColor: '#4A4A5A',
    progressColor: '#22D3EE',
    cursorColor: 'transparent',
    cursorWidth: 0,
    height: props.height || 128,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    plugins: [regions],
  })
  ws.setVolume(1)
  attachGainGraph(ws, 'primary')

  ws.on('ready', () => {
    updatePrimaryLoading(100)
    duration.value = ws.getDuration()
    emit('ready', duration.value)
    renderIssueRegions()
  })
  ws.on('loading', (percent: number) => {
    updatePrimaryLoading(percent)
  })

  let lastTimeUpdateMs = 0
  ws.on('timeupdate', (time: number) => {
    // Throttle Vue reactive updates to ~20fps to avoid flooding the reactivity
    // system at 60fps and causing main-thread pressure that can stutter audio.
    const now = Date.now()
    if (now - lastTimeUpdateMs >= 50) {
      currentTime.value = time
      emit('timeupdate', time)
      lastTimeUpdateMs = now
    }
    // Compare sync is handled at key moments (play, pause, seek, A/B switch)
    // rather than continuously here, to avoid seekTo() stutter on the B track.
  })

  ws.on('play', () => { isPlaying.value = true })
  ws.on('pause', () => { isPlaying.value = false })
  ws.on('error', () => { isPrimaryLoading.value = false })

  ws.on('click', () => {
    if (Date.now() - lastSelectionAt.value < 250) return
    // In seek mode clicks only move the play head (wavesurfer handles that
    // natively). Point markers are only created in annotate mode.
    if (props.selectable && props.mode !== 'annotate') return
    emit('click', ws.getCurrentTime())
  })

  ws.on('interaction', (newTime: number) => {
    if (compareWaveSurfer.value && isCompareMode.value) {
      if (abMode.value === 'B') {
        const primaryDur = ws.getDuration()
        const compDur = compareWaveSurfer.value.getDuration()
        if (primaryDur > 0 && compDur > 0) {
          const clickedRatio = Math.min(Math.max(newTime / primaryDur, 0), 1)
          const compareTime = clickedRatio * compDur
          syncPrimaryToCompareTime(compareTime)
          syncCompareToPrimaryTime(compareTime)
          return
        }
      }
      syncCompareToPrimaryTime(newTime)
    }
  })

  regions.on('region-clicked', (region: any, e: Event) => {
    e.stopPropagation()
    const issue = props.issues?.find(i => String(i.id) === region.id)
    if (issue) emit('regionClick', issue)
  })

  regions.on('region-created', (region: any) => {
    if (isRenderingRegions.value) return
    syncSelectedRange(region, false)
  })

  regions.on('region-updated', (region: any) => {
    if (selectionRegionId.value !== region.id) return
    syncSelectedRange(region, true)
  })

  applyDragSelection()

  loadedAudioUrl = props.audioUrl
  isPrimaryLoading.value = true
  primaryLoadProgress.value = 0
  loadAudioCached(props.audioUrl, (p) => updatePrimaryLoading(p))
    .then(blobUrl => ws.load(blobUrl))
    .catch((err) => {
      loadedAudioUrl = ''
      isPrimaryLoading.value = false
      console.warn('WaveformPlayer: failed to load audio', err)
    })

  wavesurfer.value = ws
})

// When audioUrl changes (different track/version), reload audio into the
// existing WaveSurfer instance instead of destroying and recreating it.
let loadedAudioUrl = ''
watch(() => props.audioUrl, async (newUrl) => {
  if (!newUrl || !wavesurfer.value) return
  if (newUrl === loadedAudioUrl) return
  loadedAudioUrl = newUrl
  isPrimaryLoading.value = true
  primaryLoadProgress.value = 0
  try {
    const blobUrl = await loadAudioCached(newUrl, (p) => updatePrimaryLoading(p))
    await wavesurfer.value.load(blobUrl)
  } catch (err) {
    loadedAudioUrl = ''
    isPrimaryLoading.value = false
    console.warn('WaveformPlayer: failed to reload audio', err)
  }
})

function renderIssueRegions() {
  if (!regionsPlugin.value) return
  isRenderingRegions.value = true
  regionsPlugin.value.clearRegions()
  selectionRegionId.value = null
  lastEmittedSelection.value = null
  highlightRegionIds.value = []

  renderSelectionRegion()

  // Restore highlights for all range markers of the active issue
  if (activeRangeIssueId.value !== null) {
    const issue = props.issues?.find(i => i.id === activeRangeIssueId.value)
    if (issue) {
      const rangeMarkers = issue.markers.filter(m => m.marker_type === 'range' && m.time_end !== null)
      if (rangeMarkers.length > 0) {
        for (const m of rangeMarkers) {
          _addHighlightRegion(issue, m.time_start, m.time_end!)
        }
      } else {
        activeRangeIssueId.value = null
      }
    } else {
      activeRangeIssueId.value = null
    }
  }

  isRenderingRegions.value = false
}

watch(() => props.issues, (issues) => {
  if (activeRangeIssueId.value === null) return
  const issue = issues?.find(i => i.id === activeRangeIssueId.value)
  const hasRange = issue?.markers.some(m => m.marker_type === 'range' && m.time_end !== null)
  if (!issue || !hasRange) {
    activeRangeIssueId.value = null
    for (const id of highlightRegionIds.value) {
      _removeRegionById(id)
    }
    highlightRegionIds.value = []
  }
})
watch(() => props.selectedRange, renderSelectionRegion, { deep: true })
watch(duration, () => {
  activePointGroupKey.value = null
})
watch(markerTimelineDuration, () => {
  activePointGroupKey.value = null
})
watch([() => props.mode, () => props.selectable], () => {
  applyDragSelection()
})

watch(compareSourceUrl, async (newCompareUrl) => {
  if (compareWaveSurfer.value) {
    disconnectGraph('compare')
    compareWaveSurfer.value.destroy()
    compareWaveSurfer.value = null
    compareDuration.value = 0
    compareCurrentTime.value = 0
  }
  isCompareLoading.value = false
  isCompareReady.value = false
  if (!newCompareUrl) {
    abMode.value = 'A'
    applyCompareMode('A')
    return
  }

  isCompareLoading.value = true
  compareLoadProgress.value = 0
  await nextTick()
  const compareContainer = compareContainerRef.value
  if (!compareContainer) {
    isCompareLoading.value = false
    return
  }

  const { default: WaveSurfer } = await import('wavesurfer.js')
  const ws = WaveSurfer.create({
    container: compareContainer,
    waveColor: 'rgba(249,115,22,0.5)',
    progressColor: 'rgba(249,115,22,0.7)',
    height: props.height || 128,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    interact: false,
    cursorWidth: 0,
  })
  ws.setVolume(1)
  attachGainGraph(ws, 'compare')

  ws.on('ready', () => {
    updateCompareLoading(100)
    compareDuration.value = ws.getDuration()
    isCompareReady.value = true
    syncCompareToPrimaryTime()
    applyCompareMode(abMode.value)

    if (wavesurfer.value?.isPlaying()) {
      syncCompareToPrimaryTime()
      ws.play()
    }
  })
  ws.on('loading', (percent: number) => {
    updateCompareLoading(percent)
  })
  ws.on('error', () => {
    isCompareLoading.value = false
  })
  let lastCompareUpdateMs = 0
  ws.on('timeupdate', (t: number) => {
    const now = Date.now()
    if (now - lastCompareUpdateMs >= 50) {
      compareCurrentTime.value = t
      lastCompareUpdateMs = now
    }
  })

  compareWaveSurfer.value = ws
  applyCompareMode(abMode.value)

  loadAudioCached(newCompareUrl, (p) => updateCompareLoading(p))
    .then(blobUrl => ws.load(blobUrl))
    .catch((err) => {
      isCompareLoading.value = false
      isCompareReady.value = false
      console.warn('WaveformPlayer: failed to load compare audio', err)
    })
})

watch(abMode, (mode) => {
  applyCompareMode(mode)
})

watch(gainDb, () => {
  applyUserGain()
})

async function togglePlay() {
  await resumeAudioContext()
  await wavesurfer.value?.playPause()
  if (compareWaveSurfer.value && isCompareMode.value) {
    if (wavesurfer.value?.isPlaying()) {
      syncCompareToPrimaryTime()
      compareWaveSurfer.value.play()
    } else {
      compareWaveSurfer.value.pause()
    }
  }
}

async function play() {
  if (!wavesurfer.value) return
  await resumeAudioContext()
  await wavesurfer.value.play()

  if (compareWaveSurfer.value && isCompareMode.value) {
    syncCompareToPrimaryTime()
    await compareWaveSurfer.value.play()
  }
}

function seekTo(time: number) {
  if (wavesurfer.value && duration.value > 0) {
    wavesurfer.value.seekTo(time / duration.value)
  }
  if (compareWaveSurfer.value && isCompareMode.value) {
    const compDur = compareWaveSurfer.value.getDuration()
    if (compDur > 0) {
      compareWaveSurfer.value.seekTo(time / compDur)
    }
  }
}

async function playFrom(time: number) {
  seekTo(time)
  await play()
}

function getCurrentTime() {
  return activeCurrentTime.value
}

onBeforeUnmount(() => {
  disconnectGraph('primary')
  disconnectGraph('compare')
  wavesurfer.value?.destroy()
  compareWaveSurfer.value?.destroy()
  void audioContext.value?.close()
})

defineExpose({ seekTo, togglePlay, highlightIssue, play, playFrom, getCurrentTime })
</script>

<template>
  <div class="card space-y-3">
    <!-- Mode toggle: shown only when parent enables selectable annotation -->
    <div
      v-if="selectable"
      class="flex items-center justify-between gap-3"
    >
      <div
        class="inline-flex rounded-full border border-border bg-background p-0.5"
        role="tablist"
        :aria-label="t('waveform.modeTabs')"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'seek'"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono transition-colors min-h-[32px] touch-manipulation"
          :class="mode === 'seek' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="setMode('seek')"
        >
          <Headphones class="h-3.5 w-3.5" :stroke-width="2" />
          {{ t('waveform.modeSeek') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'annotate'"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono transition-colors min-h-[32px] touch-manipulation"
          :class="mode === 'annotate' ? 'bg-primary text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="setMode('annotate')"
        >
          <MapPin class="h-3.5 w-3.5" :stroke-width="2" />
          {{ t('waveform.modeAnnotate') }}
        </button>
      </div>
      <span class="hidden sm:inline text-[11px] text-muted-foreground">
        {{ mode === 'annotate' ? t('waveform.modeHintAnnotate') : t('waveform.modeHintSeek') }}
      </span>
    </div>

    <div class="relative" :style="{ paddingTop: hasPointIssues ? '14px' : '0' }">
      <div
        v-if="hasPointIssues"
        class="pointer-events-none absolute inset-x-0 top-0 z-20 overflow-visible"
        :style="{ height: `${overlayHeight + 14 + (hasRangeIssues && markerTimelineDuration > 0 ? rangeRulerHeight + 4 : 0)}px` }"
      >
        <div
          v-for="group in pointGroups"
          :key="group.key"
          class="absolute top-0 flex flex-col items-center"
          :class="markerAnchorClass(group.markerAlign)"
          :style="{ left: group.left, height: '100%' }"
        >
          <button
            type="button"
            class="pointer-events-auto flex h-full flex-col items-center outline-none"
            :aria-label="group.issues.length > 1 ? t('waveform.pointGroup', { count: group.issues.length }) : group.issues[0]?.title"
            @click="togglePointGroup(group.key)"
            @mouseenter="emitPointGroupHover(group)"
            @mouseleave="emitIssueLeave"
          >
            <span
              v-if="hasRangeIssues && markerTimelineDuration > 0"
              class="shrink-0"
              :style="{ height: `${rangeRulerHeight + 4}px` }"
            />
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-150"
              :style="pointGroupDotStyle(group)"
            />
            <span
              v-if="group.issues.length > 1"
              class="mt-0.5 inline-flex min-w-[14px] shrink-0 items-center justify-center rounded-full border border-border bg-card px-1 text-[9px] font-mono font-semibold leading-[14px] text-foreground"
            >
              {{ group.issues.length }}
            </span>
            <span
              class="mt-0.5 w-px flex-1"
              :style="pointGroupLineStyle(group)"
            />
          </button>

          <div
            v-if="activePointGroupKey === group.key"
            class="pointer-events-auto absolute top-4 z-30 w-56 rounded-lg border border-border bg-card/95 p-2 shadow-xl backdrop-blur"
            :class="popoverAnchorClass(group.popoverAlign)"
          >
            <button
              v-for="issue in group.issues"
              :key="issue.id"
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-border/40"
              @click="selectIssue(issue)"
              @mouseenter="emitIssueHover(issue)"
              @mouseleave="emitIssueLeave"
            >
              <span
                class="mt-1 h-2 w-2 shrink-0 rounded-full"
                :style="{ background: isIssueResolvedLike(issue.status) ? RESOLVED_TONE.edge : rangeTone(issue.severity).edge }"
              />
              <span class="min-w-0">
                <span class="block truncate text-xs font-medium text-foreground">{{ issue.title }}</span>
                <span class="block text-[11px] text-muted-foreground">{{ formatTime(group.time) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="relative" :style="{ paddingTop: hasRangeIssues && markerTimelineDuration > 0 ? `${rangeRulerHeight + 4}px` : '0' }">
        <!-- Range ruler bar above waveform -->
        <div
          v-if="hasRangeIssues && markerTimelineDuration > 0"
          class="absolute inset-x-0 top-0 z-10"
          :style="{ height: `${rangeRulerHeight}px` }"
        >
          <button
            v-for="item in rangeLaneItems"
            :key="`${item.issue.id}-${item.marker.id}`"
            type="button"
            class="absolute min-w-[4px] cursor-pointer transition-all duration-150"
            :class="activeRangeIssueId === item.issue.id ? 'z-10' : 'z-[1]'"
            :style="{
              left: getMarkerPosition(item.marker.time_start),
              width: getRangeWidth(item.marker.time_start, item.marker.time_end),
              bottom: rangeLaneOffset(item.lane),
              height: '4px',
              ...rangeRulerBarStyle(item.issue),
            }"
            @click.stop="handleTimelineClick(item.issue)"
            @mouseenter="onRangeLaneMouseEnter(item)"
            @mouseleave="onRangeLaneMouseLeave"
          >
            <span
              class="pointer-events-none absolute top-full z-20 mt-1 min-w-max whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-[11px] font-mono text-foreground opacity-0 transition-opacity duration-150"
              :class="[rangeTooltipAlignClass(item), visibleRangeTooltipKeys.has(`${item.issue.id}-${item.marker.id}`) ? 'opacity-100' : '']"
              :style="rangeRulerTooltipStyle(item.issue)"
            >{{ formatTimeShort(item.marker.time_start) }} <span class="opacity-50 mx-0.5">→</span> {{ formatTimeShort(item.marker.time_end) }}</span>
          </button>
        </div>
        <div
          ref="container"
          class="relative overflow-hidden rounded-none bg-[#0D0D0D] transition-[z-index] touch-manipulation"
          :class="[abMode === 'A' ? 'z-[2]' : 'z-0', selectable && mode === 'annotate' ? 'cursor-crosshair' : 'cursor-pointer']"
          :style="{ height: `${props.height || 128}px` }"
          @pointermove="onWaveformPointerMove"
          @pointerleave="onWaveformPointerLeave"
        />
        <!-- Draft marker overlays (pending markers being added to a new issue) -->
        <div
          v-if="(draftPointList.length || draftRangeList.length || draftRangeAnchorLeft !== null) && markerTimelineDuration > 0"
          class="pointer-events-none absolute inset-0 z-10"
        >
          <!-- Draft range fills — primary orange with dashed outline -->
          <div
            v-for="(dr, i) in draftRangeList"
            :key="`dr-${i}`"
            class="absolute inset-y-0"
            :style="{
              left: getMarkerPosition(dr.time_start),
              width: getRangeWidth(dr.time_start, dr.time_end),
              background: DRAFT_FILL,
              borderLeft: `2px dashed ${DRAFT_EDGE}`,
              borderRight: `2px dashed ${DRAFT_EDGE}`,
            }"
          />
          <!-- Draft point lines — primary orange dashed -->
          <template v-for="(dp, i) in draftPointList" :key="`dp-${i}`">
            <div
              class="absolute top-0 bottom-0"
              :style="{ left: dp.left, width: '0', borderLeft: `2px dashed ${DRAFT_EDGE}`, opacity: 0.9 }"
            />
            <span
              class="absolute -top-3 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full text-[8px] font-mono font-bold leading-none text-background"
              :style="{ left: dp.left, background: DRAFT_EDGE, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }"
            >{{ dp.index }}</span>
          </template>
          <template v-if="draftRangeAnchorLeft !== null">
            <div
              class="absolute top-0 bottom-0"
              :style="{
                left: draftRangeAnchorLeft,
                width: '0',
                borderLeft: `2px dashed ${DRAFT_EDGE}`,
              }"
            />
            <span
              class="absolute -top-3 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full text-[8px] font-mono font-bold leading-none text-background"
              :style="{ left: draftRangeAnchorLeft, background: DRAFT_EDGE, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }"
            >A</span>
          </template>
        </div>
        <!-- Hover time tooltip -->
        <div
          v-if="hoverTime !== null && markerTimelineDuration > 0 && !isPrimaryLoading"
          class="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded-full border border-border bg-card/95 px-2 py-0.5 text-[10px] font-mono text-foreground shadow-sm backdrop-blur"
          :style="{ left: `${hoverLeft}px` }"
        >
          {{ formatTime(hoverTime) }}
        </div>
        <div
          v-if="isPrimaryLoading"
          class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/72"
        >
          <div class="rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-mono text-foreground shadow-lg">
            {{ t('common.loading') }} {{ primaryLoadProgress }}%
          </div>
        </div>
        <div
          v-if="isCompareMode"
          ref="compareContainerRef"
          class="absolute inset-0 pointer-events-none transition-[z-index]"
          :class="abMode === 'B' ? 'z-[2]' : 'z-0'"
        ></div>
        <div v-if="isCompareMode" class="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-lg p-1 z-10">
          <button
            type="button"
            @click="setAbMode('A')"
            :class="['px-2 py-0.5 rounded text-xs font-bold transition-colors', abMode === 'A' ? 'bg-primary text-background' : 'text-muted-foreground hover:text-white']">
            A
          </button>
          <button
            type="button"
            @click="setAbMode('B')"
            :class="[
              'px-2 py-0.5 rounded text-xs font-bold transition-colors',
              abMode === 'B' ? 'bg-primary text-background' : 'text-muted-foreground hover:text-white',
              isCompareLoading ? 'cursor-wait' : '',
            ]">
            B
          </button>
          <span class="text-xs text-muted-foreground px-1">
            {{ isCompareLoading ? `Loading B ${compareLoadProgress}%` : (abMode === 'A' ? $t('compare.currentVersion') : $t('compare.previousVersion')) }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <div
        v-if="showGainControl && hasActiveGain"
        class="flex flex-col gap-2 border border-primary/40 bg-warning-bg px-3 py-2"
        :class="compact ? '' : 'sm:flex-row sm:items-center sm:justify-between'"
      >
        <span class="text-sm font-mono font-semibold text-warning">
          {{ t('waveform.activeGainNotice', { gain: formatGainDb(gainDb) }) }}
        </span>
        <button
          type="button"
          class="w-fit rounded-full border border-primary/60 px-2.5 py-1 text-[11px] font-mono text-warning transition-colors hover:bg-primary/15"
          @click="resetGain"
        >
          {{ t('waveform.resetToZeroDb') }}
        </button>
      </div>

      <div class="flex flex-col gap-3" :class="compact ? '' : 'sm:flex-row sm:items-center sm:justify-between'">
      <div class="flex items-center gap-4">
        <button type="button" @click="togglePlay" class="text-primary hover:text-primary-hover transition-colors">
          <Play v-if="!isPlaying" class="w-8 h-8" fill="currentColor" :stroke-width="0" />
          <Pause v-else class="w-8 h-8" fill="currentColor" :stroke-width="0" />
        </button>
        <span class="text-sm text-muted-foreground font-mono">
          {{ formatTime(activeCurrentTime) }} / {{ formatTime(activeDuration) }}
        </span>
      </div>

      <div v-if="showGainControl" class="flex flex-col gap-2" :class="compact ? '' : 'sm:min-w-[18rem] sm:items-end'">
        <div class="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span>{{ t('waveform.gain') }}</span>
          <span class="text-foreground">{{ formatGainDb(gainDb) }}</span>
          <button
            type="button"
            class="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
            @click="resetGain"
          >
            {{ t('waveform.resetGain') }}
          </button>
        </div>
        <input
          :value="gainDb"
          type="range"
          :min="MIN_GAIN_DB"
          :max="MAX_GAIN_DB"
          step="0.5"
          class="h-2 w-full cursor-pointer accent-primary"
          :class="compact ? '' : 'sm:w-72'"
          :aria-label="t('waveform.gain')"
          @input="onGainInput"
        />
      </div>
      </div>
    </div>
  </div>
</template>
