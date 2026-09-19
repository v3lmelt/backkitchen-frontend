import type { StageAssignment, WorkflowStepDef } from '@/types'

export function previewFlexibleReview(selected: number[], assignments: StageAssignment[], step: WorkflowStepDef | null | undefined) {
  const previous = new Map(assignments.map(assignment => [assignment.user_id, assignment]))
  const selectedSet = new Set(selected)
  const added = selected.filter(id => !previous.has(id))
  const removed = assignments.filter(assignment => !selectedSet.has(assignment.user_id)).map(assignment => assignment.user_id)
  const completed = selected.map(id => previous.get(id)).filter(assignment => assignment?.status === 'completed')
  const ready = selected.length > 0 && completed.length === selected.length
  const forward = Object.keys(step?.transitions ?? {}).find(decision => decision === 'pass' || decision === 'approve')
  const revision = Object.keys(step?.transitions ?? {}).find(decision => decision !== forward)
  const decision = ready ? (revision && completed.some(assignment => assignment?.decision === revision) ? revision : forward) : undefined
  return { added, removed, completed: completed.length, target: decision ? step?.transitions[decision] : undefined }
}
