import type { MentionCandidates } from '@/types'

export function emptyMentionCandidates(): MentionCandidates {
  return {
    general: [],
    mastering: [],
    issue_public: [],
    issue_internal: [],
  }
}
