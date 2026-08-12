import { type MaybeRef, onUnmounted, unref, watch } from 'vue'

import { getAuthToken } from '@/api'
import { buildWsUrl } from '@/utils/url'
import { useReconnectingWebSocket } from '@/composables/useReconnectingWebSocket'

/**
 * Opens a WebSocket connection for a specific track. Reconnects automatically
 * on disconnect. Calls `onTrackUpdated` whenever the server broadcasts a
 * `track_updated` message for this track.
 */
export interface TrackWebSocketOptions {
  onDiscussionEvent?: (event: string, discussionId: number) => void
}

export function useTrackWebSocket(trackId: MaybeRef<number>, onTrackUpdated: () => void, options?: TrackWebSocketOptions) {
  // Track id captured at connect time, so late messages from a stale socket
  // can be filtered against the currently active track.
  let socketTrackId: number | null = null

  const socket = useReconnectingWebSocket({
    getUrl: () => {
      const token = getAuthToken()
      if (!token) return null
      socketTrackId = unref(trackId)
      return `${buildWsUrl(`/ws/tracks/${socketTrackId}`)}?token=${token}`
    },
    onMessage: (event) => {
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
    },
  })

  socket.start()

  // Reconnect from scratch when the route track changes or the auth token
  // rotates — same as retry(): drop the socket, reset backoff, reconnect.
  const stopTrackWatch = watch(() => unref(trackId), () => socket.retry())

  function handleAuthChanged() {
    socket.retry()
  }

  window.addEventListener('backkitchen:auth-changed', handleAuthChanged)

  onUnmounted(() => {
    stopTrackWatch()
    window.removeEventListener('backkitchen:auth-changed', handleAuthChanged)
    socket.stop()
  })

  return { connected: socket.connected, reconnectAttempts: socket.reconnectAttempts, retry: socket.retry }
}
