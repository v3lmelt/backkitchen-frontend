import { ref, onUnmounted } from 'vue'

const TOKEN_KEY = 'backkitchen_token'

function getWsUrl(path: string): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '') as string
  if (apiBase) {
    // Production with explicit API URL — convert http(s) → ws(s)
    const wsOrigin = apiBase.replace(/^http(s?):/, (_m, s) => `ws${s}:`)
    return `${wsOrigin}${path}`
  }
  // Dev (Vite proxy handles /ws → ws://localhost:8001) or same-origin production
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/**
 * Opens a WebSocket connection for a specific track. Reconnects automatically
 * on disconnect. Calls `onTrackUpdated` whenever the server broadcasts a
 * `track_updated` message for this track.
 */
export function useTrackWebSocket(trackId: number, onTrackUpdated: () => void) {
  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  let reconnectDelay = 2000

  function connect() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    try {
      ws = new WebSocket(`${getWsUrl(`/ws/tracks/${trackId}`)}?token=${token}`)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      connected.value = true
      reconnectDelay = 2000
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type === 'track_updated' && msg.track_id === trackId) {
          onTrackUpdated()
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      connected.value = false
      ws = null
      if (shouldReconnect) scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30000)
      connect()
    }, reconnectDelay)
  }

  connect()

  onUnmounted(() => {
    shouldReconnect = false
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return { connected }
}
