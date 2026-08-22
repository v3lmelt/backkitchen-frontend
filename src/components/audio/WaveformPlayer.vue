<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Play, Pause, Headphones, MapPin, Maximize2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { Issue, IssueMarker } from '@/types'
import type WaveSurfer from 'wavesurfer.js'
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import { resolveAssetUrl, sourceVersionAudioUrl } from '@/api'
import { useTrackPlaybackPreference } from '@/composables/useTrackPlaybackPreference'
import { useAppStore } from '@/stores/app'
import { formatTimestamp, formatTimestampShort, roundToMilliseconds } from '@/utils/time'
import { isIssueResolvedLike, isIssueUnresolved } from '@/utils/issueStatus'
import { loadAudioBlobCached } from '@/utils/audioCache'
import { THEME_CHANGED_EVENT } from '@/utils/theme'

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
  zoomable?: boolean
}>(), {
  mode: 'seek',
  showGainControl: true,
  playbackScope: 'source',
  compact: false,
  zoomable: false,
})

const emit = defineEmits<{
  ready: [duration: number]
  timeupdate: [time: number]
  playbackStateChange: [isPlaying: boolean]
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
const visibleStartTime = ref(0)
const visibleEndTime = ref(0)
const waveformViewportWidth = ref(0)
const zoomStep = ref(0)
const isPanning = ref(false)
const isSpacePressed = ref(false)
const isWaveformHovered = ref(false)
let panPointerId: number | null = null
let panStartX = 0
let panStartScroll = 0
let lastPanAt = 0
const compareSourceUrl = computed(() => {
  if (props.compareAudioUrl) return props.compareAudioUrl
  if (props.compareVersionId && props.trackId) {
    return resolveAssetUrl(sourceVersionAudioUrl(props.trackId, props.compareVersionId))
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
const markerTimelineDuration = computed(() => duration.value)
const MAX_ZOOM_DENSITY = 200
const ZOOM_MULTIPLIERS = [1, 2, 4, 8, 16, 32, 64, 128] as const
const fitPxPerSec = computed(() => {
  if (duration.value <= 0 || waveformViewportWidth.value <= 0) return 0
  return waveformViewportWidth.value / duration.value
})
const maxZoomStep = computed(() => {
  if (fitPxPerSec.value <= 0 || fitPxPerSec.value >= MAX_ZOOM_DENSITY) return 0
  const cappedIndex = ZOOM_MULTIPLIERS.findIndex(multiplier => fitPxPerSec.value * multiplier >= MAX_ZOOM_DENSITY)
  return cappedIndex === -1 ? ZOOM_MULTIPLIERS.length - 1 : cappedIndex
})
const isZoomed = computed(() => props.zoomable && zoomStep.value > 0)
const visibleTimelineStart = computed(() => {
  if (!isZoomed.value) return 0
  return Math.min(Math.max(visibleStartTime.value, 0), markerTimelineDuration.value)
})
const visibleTimelineEnd = computed(() => {
  if (!isZoomed.value || visibleEndTime.value <= visibleTimelineStart.value) return markerTimelineDuration.value
  return Math.min(Math.max(visibleEndTime.value, visibleTimelineStart.value), markerTimelineDuration.value)
})
const visibleTimelineDuration = computed(() => Math.max(visibleTimelineEnd.value - visibleTimelineStart.value, 0))
const zoomFactor = computed(() => {
  if (zoomStep.value === 0 || fitPxPerSec.value <= 0) return 1
  return getZoomDensity(zoomStep.value) / fitPxPerSec.value
})
const zoomDisplay = computed(() => zoomStep.value === 0
  ? t('waveform.fit')
  : t('waveform.zoomMultiplier', { value: formatZoomFactor(zoomFactor.value) }))
// Draft and major issue markers use a dedicated waveform-marker token so the
// light theme can keep annotations brighter without changing the brand accent.
const FALLBACK_RGB: Record<string, string> = {
  '--color-primary': '255 132 0',
  '--color-primary-light': '255 179 102',
  '--color-error': '255 92 51',
  '--color-info': '178 178 255',
  '--color-muted-foreground': '184 185 182',
  '--color-success': '182 255 206',
  '--color-waveform-wave': '74 74 90',
  '--color-waveform-progress': '34 211 238',
  '--color-waveform-marker': '255 132 0',
  '--color-waveform-resolved-marker': '182 255 206',
}

function tokenColor(token: string, alpha?: number): string {
  return alpha == null ? `rgb(var(${token}))` : `rgb(var(${token}) / ${alpha})`
}

function resolvedTokenColor(token: string, alpha?: number): string {
  let value = FALLBACK_RGB[token] ?? '255 132 0'
  if (typeof window !== 'undefined') {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (resolved) value = resolved
  }
  return alpha == null ? `rgb(${value})` : `rgb(${value} / ${alpha})`
}

function waveformWaveColor(alpha?: number): string {
  return resolvedTokenColor('--color-waveform-wave', alpha)
}

function waveformProgressColor(alpha?: number): string {
  return resolvedTokenColor('--color-waveform-progress', alpha)
}

function compareColor(alpha?: number): string {
  return resolvedTokenColor('--color-primary-light', alpha)
}

const DRAFT_EDGE = tokenColor('--color-waveform-marker')
const DRAFT_FILL = tokenColor('--color-waveform-marker', 0.22)
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
// AGENTS.md (error / waveform-marker / info / muted-foreground).
const RANGE_TONES: Record<string, { edge: string; fill: string; soft: string; glow: string }> = {
  critical: {
    edge: tokenColor('--color-error'),
    fill: tokenColor('--color-error', 0.78),
    soft: tokenColor('--color-error', 0.30),
    glow: tokenColor('--color-error', 0.22),
  },
  major: {
    edge: tokenColor('--color-waveform-marker'),
    fill: tokenColor('--color-waveform-marker', 0.76),
    soft: tokenColor('--color-waveform-marker', 0.26),
    glow: tokenColor('--color-waveform-marker', 0.20),
  },
  minor: {
    edge: tokenColor('--color-info'),
    fill: tokenColor('--color-info', 0.70),
    soft: tokenColor('--color-info', 0.24),
    glow: tokenColor('--color-info', 0.20),
  },
  suggestion: {
    edge: tokenColor('--color-muted-foreground'),
    fill: tokenColor('--color-muted-foreground', 0.62),
    soft: tokenColor('--color-muted-foreground', 0.22),
    glow: tokenColor('--color-muted-foreground', 0.18),
  },
}

const RESOLVED_TONE = {
  edge: tokenColor('--color-waveform-resolved-marker'),
  fill: tokenColor('--color-waveform-resolved-marker', 0.58),
  soft: tokenColor('--color-waveform-resolved-marker', 0.22),
  glow: tokenColor('--color-waveform-resolved-marker', 0.18),
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

function getMarkerStatus(issues: Issue[]): MarkerStatus {
  return issues.every(issue => !isIssueUnresolved(issue.status)) ? 'resolved' : 'unresolved'
}

function getMarkerPosition(time: number): string {
  if (visibleTimelineDuration.value <= 0) return '0%'
  return `${clampPercent(((time - visibleTimelineStart.value) / visibleTimelineDuration.value) * 100)}%`
}

interface PointMarkerGroupBase {
  key: string
  time: number
  issues: Issue[]
  status: MarkerStatus
}

function getMarkerPercent(time: number): number {
  if (visibleTimelineDuration.value <= 0) return 0
  return clampPercent(((time - visibleTimelineStart.value) / visibleTimelineDuration.value) * 100)
}

function timeIsVisible(time: number): boolean {
  return time >= visibleTimelineStart.value && time <= visibleTimelineEnd.value
}

function rangeOverlapsVisibleWindow(start: number, end: number): boolean {
  return end >= visibleTimelineStart.value && start <= visibleTimelineEnd.value
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
  if (visibleTimelineDuration.value <= 0) return '0%'
  const visibleStart = Math.max(Math.min(start, end), visibleTimelineStart.value)
  const visibleEnd = Math.min(Math.max(start, end), visibleTimelineEnd.value)
  const width = ((visibleEnd - visibleStart) / visibleTimelineDuration.value) * 100
  return `${Math.max(clampPercent(width), 0.35)}%`
}

const pointGroupBases = computed<PointMarkerGroupBase[]>(() => {
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
      const issues = [...issueMap.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return {
        key: String(key),
        time,
        issues,
        status: getMarkerStatus(issues),
      }
    })
    .sort((a, b) => a.time - b.time)
})

const pointGroups = computed<PointMarkerGroup[]>(() => pointGroupBases.value
  .filter(group => timeIsVisible(group.time))
  .map((group) => {
    const percent = getMarkerPercent(group.time)
    return {
      ...group,
      percent,
      left: `${percent}%`,
      markerAlign: getPointMarkerAlign(percent),
      popoverAlign: getPointPopoverAlign(percent),
    }
  }))

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

const visibleRangeLaneItems = computed(() => rangeLaneItems.value.filter(item => (
  rangeOverlapsVisibleWindow(item.marker.time_start, item.marker.time_end)
)))

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
    .filter(m => timeIsVisible(m.time))
})

const draftRangeList = computed(() => {
  if (!props.draftMarkers?.length || markerTimelineDuration.value <= 0) return []
  return props.draftMarkers
    .filter(m => m.marker_type === 'range' && m.time_end !== null)
    .filter(m => rangeOverlapsVisibleWindow(m.time_start, m.time_end!))
    .map((m, i) => ({
      index: i + 1,
      time_start: m.time_start,
      time_end: m.time_end!,
    }))
})

const draftRangeAnchorLeft = computed(() => {
  if (props.draftRangeAnchor == null || markerTimelineDuration.value <= 0) return null
  if (!timeIsVisible(props.draftRangeAnchor)) return null
  return getMarkerPosition(props.draftRangeAnchor)
})

const overlayHeight = computed(() => props.height || 128)

const hasPointIssues = computed(() => (props.issues ?? []).some(i => i.markers.some(m => m.marker_type === 'point')))
const hasRangeIssues = computed(() => rangeLaneItems.value.length > 0)
const rangeRulerHeight = computed(() => Math.max(rangeLaneCount.value, 1) * 6)


function togglePointGroup(groupKey: string) {
  activePointGroupKey.value = activePointGroupKey.value === groupKey ? null : groupKey
}

function selectIssue(issue: Issue, time: number) {
  activePointGroupKey.value = null
  centerTimeInView(time)
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
    boxShadow: hovered ? `0 0 0 2px ${tone.soft}, 0 0 6px ${tone.glow}` : `0 0 0 1px ${tokenColor('--color-overlay', 0.4)}`,
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
    boxShadow: `0 4px 12px ${tokenColor('--color-overlay', 0.32)}`,
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
  if (isPanning.value && panPointerId === event.pointerId && wavesurfer.value) {
    const nextScroll = panStartScroll - (event.clientX - panStartX)
    syncWaveformScroll(nextScroll)
    event.preventDefault()
  }
  if (markerTimelineDuration.value <= 0) return
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  hoverTime.value = visibleTimelineStart.value + (x / rect.width) * visibleTimelineDuration.value
  hoverLeft.value = x
}

function onWaveformPointerLeave() {
  hoverTime.value = null
  isWaveformHovered.value = false
}

function onWaveformPointerEnter() {
  isWaveformHovered.value = true
}

function canPanWaveform(): boolean {
  return isZoomed.value && (props.mode === 'seek' || isSpacePressed.value)
}

function onWaveformPointerDown(event: PointerEvent) {
  if (!canPanWaveform() || !wavesurfer.value || event.button !== 0) return
  panPointerId = event.pointerId
  panStartX = event.clientX
  panStartScroll = wavesurfer.value.getScroll()
  isPanning.value = true
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function endWaveformPan(event: PointerEvent) {
  if (panPointerId !== event.pointerId) return
  const currentScroll = wavesurfer.value?.getScroll() ?? panStartScroll
  if (Math.abs(currentScroll - panStartScroll) > 2) lastPanAt = Date.now()
  ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  panPointerId = null
  isPanning.value = false
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (event.code !== 'Space' || !isWaveformHovered.value || !isZoomed.value) return
  event.preventDefault()
  isSpacePressed.value = true
}

function onWindowKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') isSpacePressed.value = false
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
    wavesurfer.value.setOptions({ waveColor: waveformWaveColor(), progressColor: waveformProgressColor(), cursorWidth: 2 })
    return
  }

  if (mode === 'A') {
    wavesurfer.value.setVolume(1)
    compareWaveSurfer.value.setVolume(0)
    setNodeGain(primaryGateGainNode.value, 1)
    setNodeGain(compareGateGainNode.value, 0)
    wavesurfer.value.setOptions({ waveColor: waveformWaveColor(), progressColor: waveformProgressColor(), cursorWidth: 2 })
    compareWaveSurfer.value.setOptions({ waveColor: compareColor(0.15), progressColor: compareColor(0.2), cursorWidth: 0 })
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
  wavesurfer.value.setOptions({ waveColor: waveformWaveColor(0.15), progressColor: waveformProgressColor(0.2), cursorWidth: 0 })
  compareWaveSurfer.value.setOptions({ waveColor: compareColor(0.28), progressColor: compareColor(), cursorWidth: 0 })
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

function handleTimelineClick(item: RangeLaneItem) {
  centerTimeInView((item.marker.time_start + item.marker.time_end) / 2)
  seekTo(item.marker.time_start)
  emit('regionClick', item.issue)
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
    element.style.boxShadow = `inset 0 0 0 1px ${tokenColor('--color-waveform-marker', 0.28)}`
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

function formatZoomFactor(value: number): string {
  if (value >= 10 || Number.isInteger(value)) return String(Math.round(value))
  return value.toFixed(1)
}

function getZoomDensity(step: number): number {
  if (fitPxPerSec.value <= 0) return 0
  const multiplier = ZOOM_MULTIPLIERS[Math.min(Math.max(step, 0), ZOOM_MULTIPLIERS.length - 1)]
  return Math.min(fitPxPerSec.value * multiplier, MAX_ZOOM_DENSITY)
}

function updateVisibleWindow(start: number, end: number) {
  const total = markerTimelineDuration.value
  visibleStartTime.value = Math.min(Math.max(start, 0), total)
  visibleEndTime.value = Math.min(Math.max(end, visibleStartTime.value), total)
  activePointGroupKey.value = null
}

function handlePrimaryScroll(start: number, end: number, scrollLeft: number) {
  updateVisibleWindow(start, end)
  if (compareWaveSurfer.value && isCompareReady.value) {
    compareWaveSurfer.value.setScroll(scrollLeft)
  }
}

function syncWaveformScroll(scrollLeft: number) {
  wavesurfer.value?.setScroll(scrollLeft)
  if (compareWaveSurfer.value && isCompareReady.value) {
    compareWaveSurfer.value.setScroll(scrollLeft)
  }
}

function applyZoomStep(nextStep: number, anchorRatio = 0.5) {
  if (!props.zoomable || !wavesurfer.value || duration.value <= 0 || fitPxPerSec.value <= 0) return

  const clampedStep = Math.min(Math.max(Math.round(nextStep), 0), maxZoomStep.value)
  const safeAnchorRatio = Math.min(Math.max(anchorRatio, 0), 1)
  const currentSpan = visibleTimelineDuration.value || duration.value
  const anchorTime = visibleTimelineStart.value + currentSpan * safeAnchorRatio
  const density = getZoomDensity(clampedStep)

  zoomStep.value = clampedStep
  wavesurfer.value.zoom(density)
  if (compareWaveSurfer.value && isCompareReady.value) compareWaveSurfer.value.zoom(density)

  const nextSpan = clampedStep === 0
    ? duration.value
    : Math.min(duration.value, waveformViewportWidth.value / density)
  const maxStart = Math.max(duration.value - nextSpan, 0)
  const nextStart = clampedStep === 0
    ? 0
    : Math.min(Math.max(anchorTime - nextSpan * safeAnchorRatio, 0), maxStart)

  wavesurfer.value.setScrollTime(nextStart)
  if (compareWaveSurfer.value && isCompareReady.value) compareWaveSurfer.value.setScrollTime(nextStart)
  updateVisibleWindow(nextStart, nextStart + nextSpan)
}

function resetZoom() {
  applyZoomStep(0)
}

function changeZoom(delta: number, anchorRatio = 0.5) {
  applyZoomStep(zoomStep.value + delta, anchorRatio)
}

function onZoomInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  applyZoomStep(Number(target?.value ?? 0))
}

function onWaveformWheel(event: WheelEvent) {
  if (!props.zoomable || duration.value <= 0) return

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    const target = event.currentTarget as HTMLElement | null
    const rect = target?.getBoundingClientRect()
    const anchorRatio = rect && rect.width > 0
      ? Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      : 0.5
    changeZoom(event.deltaY < 0 ? 1 : -1, anchorRatio)
    return
  }

  if (!isZoomed.value || !wavesurfer.value) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return
  event.preventDefault()
  syncWaveformScroll(wavesurfer.value.getScroll() + delta)
}

function centerTimeInView(time: number) {
  if (!isZoomed.value || visibleTimelineDuration.value <= 0) return
  const span = visibleTimelineDuration.value
  const maxStart = Math.max(duration.value - span, 0)
  const nextStart = Math.min(Math.max(time - span / 2, 0), maxStart)
  wavesurfer.value?.setScrollTime(nextStart)
  if (compareWaveSurfer.value && isCompareReady.value) compareWaveSurfer.value.setScrollTime(nextStart)
  updateVisibleWindow(nextStart, nextStart + span)
}

function focusIssue(issue: Issue | number) {
  const issueId = typeof issue === 'number' ? issue : issue.id
  const target = props.issues?.find(item => item.id === issueId)
  const marker = target?.markers[0]
  if (!marker) return

  if (isZoomed.value) {
    const viewportCenter = visibleTimelineStart.value + visibleTimelineDuration.value / 2
    const centerTolerance = Math.max(visibleTimelineDuration.value * 0.01, 0.01)
    const alreadyCentered = target.markers.some(item => {
      const itemTime = item.time_end == null
        ? item.time_start
        : (item.time_start + item.time_end) / 2
      return Math.abs(itemTime - viewportCenter) <= centerTolerance
    })
    if (alreadyCentered) return
  }

  const focusTime = marker.time_end == null
    ? marker.time_start
    : (marker.time_start + marker.time_end) / 2
  centerTimeInView(focusTime)
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

function handleThemeChanged() {
  applyCompareMode(abMode.value)
  renderIssueRegions()
}

onMounted(async () => {
  window.addEventListener(THEME_CHANGED_EVENT, handleThemeChanged)
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('keyup', onWindowKeyUp)
  if (!container.value) return

  const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
    import('wavesurfer.js'),
    import('wavesurfer.js/dist/plugins/regions.js'),
  ])

  const regions = RegionsPlugin.create()
  regionsPlugin.value = regions

  const ws = WaveSurfer.create({
    container: container.value,
    waveColor: waveformWaveColor(),
    progressColor: waveformProgressColor(),
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
    waveformViewportWidth.value = ws.getWidth()
    updateVisibleWindow(0, duration.value)
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

  ws.on('play', () => {
    isPlaying.value = true
    emit('playbackStateChange', true)
  })
  ws.on('pause', () => {
    isPlaying.value = false
    emit('playbackStateChange', false)
  })
  ws.on('error', (err: unknown) => {
    isPrimaryLoading.value = false
    console.error('WaveformPlayer: wavesurfer primary error', err)
  })

  ws.on('click', () => {
    if (Date.now() - lastSelectionAt.value < 250) return
    if (Date.now() - lastPanAt < 250) return
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

  ws.on('scroll', (start: number, end: number, scrollLeft: number) => {
    handlePrimaryScroll(start, end, scrollLeft)
  })

  ws.on('resize', () => {
    waveformViewportWidth.value = ws.getWidth()
    if (props.zoomable && zoomStep.value > 0) {
      applyZoomStep(zoomStep.value)
    } else {
      updateVisibleWindow(0, duration.value)
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
  loadAudioBlobCached(props.audioUrl, (p) => updatePrimaryLoading(p))
    .then(blob => ws.loadBlob(blob))
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
  zoomStep.value = 0
  updateVisibleWindow(0, 0)
  isPrimaryLoading.value = true
  primaryLoadProgress.value = 0
  try {
    const blob = await loadAudioBlobCached(newUrl, (p) => updatePrimaryLoading(p))
    await wavesurfer.value.loadBlob(blob)
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
watch(() => props.zoomable, (zoomable) => {
  if (!zoomable || duration.value <= 0) return
  zoomStep.value = 0
  updateVisibleWindow(0, duration.value)
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
    waveColor: compareColor(0.5),
    progressColor: compareColor(0.7),
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
    const density = getZoomDensity(zoomStep.value)
    if (props.zoomable && zoomStep.value > 0 && density > 0) {
      ws.zoom(density)
      ws.setScroll(wavesurfer.value?.getScroll() ?? 0)
    }
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
  ws.on('error', (err: unknown) => {
    isCompareLoading.value = false
    console.error('WaveformPlayer: wavesurfer compare error', err)
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

  loadAudioBlobCached(newCompareUrl, (p) => updateCompareLoading(p))
    .then(blob => ws.loadBlob(blob))
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
  centerTimeInView(time)
  seekTo(time)
  await play()
}

function getCurrentTime() {
  return activeCurrentTime.value
}

function exportPeaks(maxLength = 400): number[] {
  const ws = wavesurfer.value
  if (!ws) return []
  try {
    const result = (ws as unknown as { exportPeaks: (opts: { channels?: number; maxLength?: number; precision?: number }) => number[][] })
      .exportPeaks({ channels: 1, maxLength, precision: 10000 })
    const channel = result?.[0]
    if (!channel?.length) return []
    const out = new Array<number>(channel.length)
    for (let i = 0; i < channel.length; i++) {
      const v = channel[i]
      out[i] = Math.max(0, Math.min(1, Math.abs(v)))
    }
    return out
  } catch {
    return []
  }
}

onBeforeUnmount(() => {
  window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChanged)
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('keyup', onWindowKeyUp)
  disconnectGraph('primary')
  disconnectGraph('compare')
  wavesurfer.value?.destroy()
  compareWaveSurfer.value?.destroy()
  void audioContext.value?.close()
})

defineExpose({ seekTo, togglePlay, highlightIssue, focusIssue, play, playFrom, getCurrentTime, exportPeaks })
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
          :class="mode === 'annotate' ? 'bg-button-primary text-button-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
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
              @click="selectIssue(issue, group.time)"
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
            v-for="item in visibleRangeLaneItems"
            :key="`${item.issue.id}-${item.marker.id}`"
            type="button"
            class="absolute min-w-[4px] cursor-pointer transition-all duration-150"
            :class="activeRangeIssueId === item.issue.id ? 'z-10' : 'z-[1]'"
            :style="{
              left: getMarkerPosition(Math.max(item.marker.time_start, visibleTimelineStart)),
              width: getRangeWidth(item.marker.time_start, item.marker.time_end),
              bottom: rangeLaneOffset(item.lane),
              height: '4px',
              ...rangeRulerBarStyle(item.issue),
            }"
            @click.stop="handleTimelineClick(item)"
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
          data-testid="waveform-canvas"
          class="relative overflow-hidden rounded-none bg-[rgb(var(--color-waveform-surface))] transition-[z-index] touch-manipulation"
          :class="[
            abMode === 'A' ? 'z-[2]' : 'z-0',
            isPanning ? 'cursor-grabbing' : (canPanWaveform() ? 'cursor-grab' : (selectable && mode === 'annotate' ? 'cursor-crosshair' : 'cursor-pointer')),
          ]"
          :style="{ height: `${props.height || 128}px` }"
          @pointerenter="onWaveformPointerEnter"
          @pointerdown="onWaveformPointerDown"
          @pointermove="onWaveformPointerMove"
          @pointerup="endWaveformPan"
          @pointercancel="endWaveformPan"
          @pointerleave="onWaveformPointerLeave"
          @wheel="onWaveformWheel"
        />
        <!-- Draft marker overlays (pending markers being added to a new issue) -->
        <div
          v-if="(draftPointList.length || draftRangeList.length || draftRangeAnchorLeft !== null) && markerTimelineDuration > 0"
          class="pointer-events-none absolute inset-0 z-10"
        >
          <!-- Draft range fills — waveform marker with dashed outline -->
          <div
            v-for="(dr, i) in draftRangeList"
            :key="`dr-${i}`"
            class="absolute inset-y-0"
            :style="{
              left: getMarkerPosition(Math.max(dr.time_start, visibleTimelineStart)),
              width: getRangeWidth(dr.time_start, dr.time_end),
              background: DRAFT_FILL,
              borderLeft: `2px dashed ${DRAFT_EDGE}`,
              borderRight: `2px dashed ${DRAFT_EDGE}`,
            }"
          />
          <!-- Draft point lines — waveform marker dashed -->
          <template v-for="(dp, i) in draftPointList" :key="`dp-${i}`">
            <div
              class="absolute top-0 bottom-0"
              :style="{ left: dp.left, width: '0', borderLeft: `2px dashed ${DRAFT_EDGE}`, opacity: 0.9 }"
            />
            <span
              class="draft-point-index absolute -top-3 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full text-[8px] font-mono font-bold leading-none text-primary-foreground"
              :style="{ left: dp.left, background: DRAFT_EDGE, boxShadow: `0 0 0 1px ${tokenColor('--color-overlay', 0.4)}` }"
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
              class="absolute -top-3 flex h-3.5 w-3.5 -translate-x-1/2 items-center justify-center rounded-full text-[8px] font-mono font-bold leading-none text-primary-foreground"
              :style="{ left: draftRangeAnchorLeft, background: DRAFT_EDGE, boxShadow: `0 0 0 1px ${tokenColor('--color-overlay', 0.4)}` }"
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
        <div v-if="isCompareMode" class="absolute top-2 right-2 flex items-center gap-1 bg-overlay/60 rounded-lg p-1 z-10">
          <button
            type="button"
            @click="setAbMode('A')"
            :class="['px-2 py-0.5 rounded text-xs font-bold transition-colors', abMode === 'A' ? 'bg-button-primary text-button-primary-foreground' : 'text-muted-foreground hover:text-foreground']">
            A
          </button>
          <button
            type="button"
            @click="setAbMode('B')"
            :class="[
              'px-2 py-0.5 rounded text-xs font-bold transition-colors',
              abMode === 'B' ? 'bg-button-primary text-button-primary-foreground' : 'text-muted-foreground hover:text-foreground',
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

    <div
      v-if="zoomable && !compact"
      class="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span class="shrink-0 text-xs font-mono text-muted-foreground">{{ t('waveform.zoom') }}</span>
        <span class="min-w-[3.5rem] text-xs font-mono font-semibold text-foreground">{{ zoomDisplay }}</span>
        <span class="hidden truncate text-[11px] text-muted-foreground lg:inline">
          {{ t('waveform.zoomHint') }}
        </span>
      </div>
      <div class="flex items-center gap-2 sm:min-w-[19rem] sm:justify-end">
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition duration-200 hover:border-primary hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="zoomStep === 0"
          :aria-label="t('waveform.zoomOut')"
          :title="t('waveform.zoomOut')"
          @click="changeZoom(-1)"
        >
          <ZoomOut class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
        <input
          :value="zoomStep"
          type="range"
          min="0"
          :max="maxZoomStep"
          step="1"
          class="waveform-zoom-slider h-2 min-w-0 flex-1 cursor-pointer sm:w-36 sm:flex-none"
          :aria-label="t('waveform.zoom')"
          @input="onZoomInput"
        />
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition duration-200 hover:border-primary hover:text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="zoomStep >= maxZoomStep"
          :aria-label="t('waveform.zoomIn')"
          :title="t('waveform.zoomIn')"
          @click="changeZoom(1)"
        >
          <ZoomIn class="h-3.5 w-3.5" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[11px] font-mono text-foreground transition duration-200 hover:border-primary hover:text-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="zoomStep === 0"
          @click="resetZoom"
        >
          <Maximize2 class="h-3.5 w-3.5" :stroke-width="2" />
          {{ t('waveform.fit') }}
        </button>
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
        <button type="button" @click="togglePlay" class="text-primary hover:text-primary-hover transition-colors relative w-8 h-8">
          <Transition name="play-icon">
            <Play v-if="!isPlaying" class="w-8 h-8 absolute inset-0" fill="currentColor" :stroke-width="0" />
            <Pause v-else class="w-8 h-8 absolute inset-0" fill="currentColor" :stroke-width="0" />
          </Transition>
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

<style scoped>
.waveform-zoom-slider {
  accent-color: rgb(var(--color-control-accent));
}

.play-icon-enter-active,
.play-icon-leave-active {
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}
.play-icon-enter-from,
.play-icon-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
</style>
