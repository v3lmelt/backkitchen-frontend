import { ref, onUnmounted } from 'vue'

import { buildWsUrl } from '@/utils/url'

const TOKEN_KEY = 'backkitchen_token'
const INITIAL_RECONNECT_DELAY = 2000
const MAX_RECONNECT_DELAY = 30000

/**
 * Opens a WebSocket connection for a specific track. Reconnects automatically
 * on disconnect. Calls `onTrackUpdated` whenever the server broadcasts a
 * `track_updated` message for this track.
 */
export interface TrackWebSocketOptions {
  onDiscussionEvent?: (event: string, discussionId: number) => void
}

export function useTrackWebSocket(trackId: number, onTrackUpdated: () => void, options?: TrackWebSocketOptions) {
  const connected = ref(false)
  const reconnectAttempts = ref(0)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  let reconnectDelay = INITIAL_RECONNECT_DELAY

  function connect() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    try {
      ws = new WebSocket(`${buildWsUrl(`/ws/tracks/${trackId}`)}?token=${token}`)
    } catch {
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      connected.value = true
      reconnectAttempts.value = 0
      reconnectDelay = INITIAL_RECONNECT_DELAY
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type === 'track_updated' && msg.track_id === trackId) {
          onTrackUpdated()
        }
        if (msg.type === 'discussion_event' && msg.track_id === trackId && options?.onDiscussionEvent) {
          options.onDiscussionEvent(msg.event, msg.discussion_id)
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
    reconnectAttempts.value += 1
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY)
      connect()
    }, reconnectDelay)
  }

  function retry() {
    if (!shouldReconnect) return
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      // Detach so the async onclose doesn't schedule a second reconnect on
      // top of the one we're about to kick off synchronously.
      ws.onclose = null
      ws.close()
      ws = null
    }
    reconnectAttempts.value = 0
    reconnectDelay = INITIAL_RECONNECT_DELAY
    connect()
  }

  connect()

  onUnmounted(() => {
    shouldReconnect = false
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return { connected, reconnectAttempts, retry }
}
