import { ref, computed, watch } from 'vue'

const STORAGE_KEY_PREFIX = 'backkitchen_dashboard_pins_'

// Module-level reactive state — shared across all component instances
const _pinnedIds = ref<Set<number>>(new Set())
let _loadedUserId: number | null = null

function loadForUser(userId: number) {
  if (_loadedUserId === userId) return
  _loadedUserId = userId
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    _pinnedIds.value = raw ? new Set(JSON.parse(raw) as number[]) : new Set()
  } catch {
    _pinnedIds.value = new Set()
  }
}

function saveForUser(userId: number) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify([..._pinnedIds.value]))
}

export function useDashboardPins(userId: number | null | undefined | (() => number | null | undefined)) {
  const resolvedUserId = computed(() => typeof userId === 'function' ? userId() : userId)

  watch(resolvedUserId, (nextUserId) => {
    if (nextUserId) loadForUser(nextUserId)
    else {
      _loadedUserId = null
      _pinnedIds.value = new Set()
    }
  }, { immediate: true })

  const hasAnyPins = computed(() => _pinnedIds.value.size > 0)

  function isPinned(albumId: number): boolean {
    return _pinnedIds.value.has(albumId)
  }

  function togglePin(albumId: number): void {
    const activeUserId = resolvedUserId.value
    if (!activeUserId) return
    const next = new Set(_pinnedIds.value)
    if (next.has(albumId)) next.delete(albumId)
    else next.add(albumId)
    _pinnedIds.value = next
    saveForUser(activeUserId)
  }

  return { hasAnyPins, isPinned, togglePin }
}
