import { type MaybeRef, ref, onUnmounted, unref, watch } from 'vue'

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

export function useTrackWebSocket(trackId: MaybeRef<number>, onTrackUpdated: () => void, options?: TrackWebSocketOptions) {
  const connected = ref(false)
  const reconnectAttempts = ref(0)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  let reconnectDelay = INITIAL_RECONNECT_DELAY

  function closeSocket() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    connected.value = false
  }

  function connect() {
    const token = localStorage.getItem(TOKEN_KEY)
    const currentTrackId = unref(trackId)
    if (!token) return

    try {
      const socket = new WebSocket(`${buildWsUrl(`/ws/tracks/${currentTrackId}`)}?token=${token}`)
      ws = socket
    } catch {
      scheduleReconnect()
      return
    }

    const socket = ws
    const socketTrackId = currentTrackId

    socket.onopen = () => {
      connected.value = true
      reconnectAttempts.value = 0
      reconnectDelay = INITIAL_RECONNECT_DELAY
    }

    socket.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type === 'track_updated' && msg.track_id === socketTrackId && socketTrackId === unref(trackId)) {
          onTrackUpdated()
        }
        if (msg.type === 'discussion_event' && msg.track_id === socketTrackId && socketTrackId === unref(trackId) && options?.onDiscussionEvent) {
          options.onDiscussionEvent(msg.event, msg.discussion_id)
        }
      } catch {
        // Ignore malformed messages
      }
    }

    socket.onclose = () => {
      if (ws !== socket) return
      connected.value = false
      ws = null
      if (shouldReconnect) scheduleReconnect()
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect || reconnectTimer !== null) return
    reconnectAttempts.value += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY)
      connect()
    }, reconnectDelay)
  }

  function retry() {
    if (!shouldReconnect) return
    closeSocket()
    reconnectAttempts.value = 0
    reconnectDelay = INITIAL_RECONNECT_DELAY
    connect()
  }

  connect()

  const stopTrackWatch = watch(() => unref(trackId), () => {
    if (!shouldReconnect) return
    closeSocket()
    reconnectAttempts.value = 0
    reconnectDelay = INITIAL_RECONNECT_DELAY
    connect()
  })

  function handleAuthChanged() {
    if (!shouldReconnect) return
    closeSocket()
    reconnectAttempts.value = 0
    reconnectDelay = INITIAL_RECONNECT_DELAY
    connect()
  }

  window.addEventListener('backkitchen:auth-changed', handleAuthChanged)

  onUnmounted(() => {
    shouldReconnect = false
    stopTrackWatch()
    window.removeEventListener('backkitchen:auth-changed', handleAuthChanged)
    closeSocket()
  })

  return { connected, reconnectAttempts, retry }
}
