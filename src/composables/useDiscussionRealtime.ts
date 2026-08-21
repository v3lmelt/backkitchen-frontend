import { onUnmounted } from 'vue'

export type DiscussionRealtimeHandler = (event: string, discussionId: number) => void

/**
 * App-wide bus for track discussion realtime events. The WebSocket owner (the
 * track workspace views) dispatches server events; any mounted component that
 * renders discussions (e.g. MasteringChatSidebar, useDiscussions consumers in
 * the view) subscribes. This keeps child components from having to expose
 * imperative event handlers to their parents.
 */
const handlers = new Set<DiscussionRealtimeHandler>()

export function useDiscussionRealtime() {
  function subscribe(handler: DiscussionRealtimeHandler) {
    handlers.add(handler)
    onUnmounted(() => {
      handlers.delete(handler)
    })
  }

  function dispatch(event: string, discussionId: number) {
    for (const handler of [...handlers]) {
      handler(event, discussionId)
    }
  }

  return { subscribe, dispatch }
}
