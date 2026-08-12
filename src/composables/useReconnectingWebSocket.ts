import { ref } from 'vue'

const INITIAL_RECONNECT_DELAY = 2000
const MAX_RECONNECT_DELAY = 30000
const BACKOFF_FACTOR = 1.5

export interface ReconnectingWebSocketOptions {
  /**
   * Returns the WebSocket URL to connect to, or `null` to skip connecting
   * (e.g. missing auth token). Called on every connect/reconnect attempt,
   * so it can read the latest auth state.
   */
  getUrl: () => string | null
  onMessage?: (event: MessageEvent, socket: WebSocket) => void
  onOpen?: (socket: WebSocket) => void
  onClose?: () => void
}

/**
 * Shared WebSocket reconnect machinery: opens a socket and reconnects with
 * exponential backoff (2s initial, x1.5 factor, 30s cap) when the connection
 * drops. The lifecycle is driven by the caller via start()/stop()/retry() —
 * nothing connects or cleans up automatically.
 */
export function useReconnectingWebSocket(options: ReconnectingWebSocketOptions) {
  const connected = ref(false)
  const reconnectAttempts = ref(0)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = false
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

  function scheduleReconnect() {
    if (!shouldReconnect || reconnectTimer !== null) return
    reconnectAttempts.value += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectDelay = Math.min(reconnectDelay * BACKOFF_FACTOR, MAX_RECONNECT_DELAY)
      connect()
    }, reconnectDelay)
  }

  function connect() {
    if (!shouldReconnect) return
    const url = options.getUrl()
    if (!url || typeof WebSocket === 'undefined') return

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
      ws = socket
    } catch {
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      connected.value = true
      reconnectAttempts.value = 0
      reconnectDelay = INITIAL_RECONNECT_DELAY
      options.onOpen?.(socket)
    }

    socket.onmessage = (event: MessageEvent) => {
      options.onMessage?.(event, socket)
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      connected.value = false
      options.onClose?.()
      if (shouldReconnect) scheduleReconnect()
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  /** Enable reconnection and open the socket. */
  function start() {
    shouldReconnect = true
    connect()
  }

  /** Disable reconnection and close the socket. */
  function stop() {
    shouldReconnect = false
    closeSocket()
  }

  /** Close the current socket and reconnect immediately, resetting backoff. */
  function retry() {
    if (!shouldReconnect) return
    closeSocket()
    reconnectAttempts.value = 0
    reconnectDelay = INITIAL_RECONNECT_DELAY
    connect()
  }

  return { connected, reconnectAttempts, start, stop, retry }
}
