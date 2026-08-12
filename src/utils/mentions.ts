import type { Issue, User } from '@/types'

/** Range of the active mention query inside a textarea. */
export interface MentionRange {
  start: number
  end: number
}

/** `@issue:<local_number> ` token referencing another issue. */
export function issueMentionToken(issue: Pick<Issue, 'local_number'>): string {
  return `@issue:${issue.local_number} `
}

/** `@user:<id> ` token referencing a user. */
export function userMentionToken(user: Pick<User, 'id'>): string {
  return `@user:${user.id} `
}

/**
 * Splice a mention token into `text`, replacing the active query range.
 * Returns the new text plus the cursor position right after the token,
 * suitable for a `setSelectionRange` call on the next tick.
 */
export function insertMentionAtCursor(
  text: string,
  mention: MentionRange,
  token: string,
): { text: string; cursorPos: number } {
  return {
    text: `${text.slice(0, mention.start)}${token}${text.slice(mention.end)}`,
    cursorPos: mention.start + token.length,
  }
}
