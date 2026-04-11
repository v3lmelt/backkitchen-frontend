import { onBeforeUnmount, ref, watch } from 'vue'

import { trackApi } from '@/api'
import type { TrackPlaybackPreference, TrackPlaybackPreferenceScope } from '@/types'

const STORAGE_KEY_PREFIX = 'backkitchen_track_playback_preference_'
const MIN_GAIN_DB = -24
const MAX_GAIN_DB = 24
const SAVE_DEBOUNCE_MS = 400

interface Context {
  trackId: number | null
  userId: number | null
  scope: TrackPlaybackPreferenceScope | null
  key: string
}

function clampGainDb(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, Math.round(value * 10) / 10))
}

function storageKey(userId: number, trackId: number, scope: TrackPlaybackPreferenceScope): string {
  return `${STORAGE_KEY_PREFIX}${userId}_${trackId}_${scope}`
}

function readCachedPreference(key: string): TrackPlaybackPreference | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TrackPlaybackPreference>
    if (typeof parsed.gain_db !== 'number') return null
    if (parsed.scope !== 'source' && parsed.scope !== 'master') return null
    if (typeof parsed.track_id !== 'number' || typeof parsed.user_id !== 'number') return null
    return {
      track_id: parsed.track_id,
      user_id: parsed.user_id,
      scope: parsed.scope,
      gain_db: clampGainDb(parsed.gain_db),
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
    }
  } catch {
    return null
  }
}

function writeCachedPreference(key: string, preference: TrackPlaybackPreference): void {
  try {
    localStorage.setItem(key, JSON.stringify({
      ...preference,
      gain_db: clampGainDb(preference.gain_db),
    }))
  } catch {
    // Ignore storage errors.
  }
}

export function useTrackPlaybackPreference(options: {
  trackId: () => number | null | undefined
  userId: () => number | null | undefined
  enabled?: () => boolean
  scope: () => TrackPlaybackPreferenceScope
}) {
  const gainDb = ref(0)
  const isLoading = ref(false)

  let saveTimer: number | null = null
  let isHydrating = false
  let pendingSave = false
  let currentContext: Context = { trackId: null, userId: null, scope: null, key: '' }

  function clearSaveTimer() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  function preferenceFromContext(context: Context, gainValue: number): TrackPlaybackPreference | null {
    if (!context.trackId || !context.userId || !context.scope || !context.key) return null
    return {
      track_id: context.trackId,
      user_id: context.userId,
      scope: context.scope,
      gain_db: clampGainDb(gainValue),
      updated_at: null,
    }
  }

  async function flushSave(context: Context = currentContext): Promise<void> {
    if (!pendingSave || !context.trackId || !context.userId || !context.scope || !context.key) return

    pendingSave = false
    const nextGainDb = clampGainDb(gainDb.value)
    try {
      const saved = await trackApi.setPlaybackPreference(context.trackId, context.scope, {
        gain_db: nextGainDb,
      })
      if (currentContext.key === context.key) {
        gainDb.value = clampGainDb(saved.gain_db)
      }
      writeCachedPreference(context.key, saved)
    } catch {
      const fallback = preferenceFromContext(context, nextGainDb)
      if (fallback) writeCachedPreference(context.key, fallback)
    }
  }

  function scheduleSave() {
    if (!currentContext.trackId || !currentContext.userId || !currentContext.key) return
    pendingSave = true
    clearSaveTimer()
    saveTimer = window.setTimeout(() => {
      const context = { ...currentContext }
      void flushSave(context)
    }, SAVE_DEBOUNCE_MS)
  }

  function setGainDb(nextGainDb: number): void {
    const next = clampGainDb(nextGainDb)
    if (gainDb.value === next) return
    gainDb.value = next

    const fallback = preferenceFromContext(currentContext, next)
    if (fallback && currentContext.key) writeCachedPreference(currentContext.key, fallback)
    if (!isHydrating) scheduleSave()
  }

  async function loadPreference(): Promise<void> {
    const previousContext = { ...currentContext }
    clearSaveTimer()
    await flushSave(previousContext)

    const enabled = options.enabled ? options.enabled() : true
    const trackId = options.trackId() ?? null
    const userId = options.userId() ?? null
    const scope = options.scope()
    if (!enabled || trackId == null || userId == null) {
      currentContext = { trackId: null, userId: null, scope: null, key: '' }
      isHydrating = true
      gainDb.value = 0
      isHydrating = false
      pendingSave = false
      isLoading.value = false
      return
    }

    const key = storageKey(userId, trackId, scope)
    currentContext = { trackId, userId, scope, key }
    const cached = readCachedPreference(key)
    isHydrating = true
    gainDb.value = cached?.gain_db ?? 0
    isHydrating = false

    isLoading.value = true
    try {
      const serverPreference = await trackApi.getPlaybackPreference(trackId, scope)
      if (currentContext.key !== key) return
      isHydrating = true
      gainDb.value = clampGainDb(serverPreference.gain_db)
      isHydrating = false
      writeCachedPreference(key, serverPreference)
    } catch {
      // Keep cached/default value when sync fails.
    } finally {
      if (currentContext.key === key) {
        isLoading.value = false
      }
    }
  }

  watch(
    [options.trackId, options.userId, options.scope, options.enabled ?? (() => true)],
    () => {
      void loadPreference()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearSaveTimer()
    void flushSave({ ...currentContext })
  })

  return {
    gainDb,
    isLoading,
    setGainDb,
    flushSave,
  }
}
