import type { WorkflowConfig } from '@/types'
import { translateStepLabel } from '@/utils/workflow'

export function progressOptions(config: WorkflowConfig | null | undefined, t: (key: string) => string) {
  const options = (config?.steps ?? []).map(step => ({ value: step.id, label: translateStepLabel(step, t) }))
  if (!options.some(option => option.value === 'completed')) options.push({ value: 'completed', label: t('status.completed') })
  return options
}

export function progressRequiresReason(config: WorkflowConfig | null | undefined, from: string, to: string): boolean {
  const ids = (config?.steps ?? []).map(step => step.id)
  const current = from === 'completed' ? ids.length : ids.indexOf(from)
  const target = to === 'completed' ? ids.length : ids.indexOf(to)
  return current >= 0 && target >= 0 && Math.abs(target - current) > 1
}
