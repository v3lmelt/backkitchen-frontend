import type { MasterDelivery, TrackSourceVersion } from '@/types'

type Translate = (key: string) => string
type DateFormatter = (iso: string) => string

export function formatSourceVersionOptionLabel(
  version: TrackSourceVersion,
  t: Translate,
  fmtDate: DateFormatter,
): string {
  const prefix = version.source_kind === 'external_link'
    ? t('workflowStep.externalSourceVersionLabel')
    : `v${version.version_number}`
  return `${prefix} · ${fmtDate(version.created_at)}`
}

export function formatMasterDeliveryOptionLabel(delivery: MasterDelivery, fmtDate: DateFormatter): string {
  const version = `v${delivery.delivery_number}`
  return `${version} · ${fmtDate(delivery.created_at)}`
}

export function historicalDeliveryDownloadSuffix(
  delivery: MasterDelivery,
  currentWorkflowCycle: number | undefined,
): string {
  if (currentWorkflowCycle == null || delivery.workflow_cycle === currentWorkflowCycle) return ''
  const timestamp = delivery.created_at.replace(/\D/g, '').slice(0, 12)
  return timestamp ? `_history_${timestamp}` : '_history'
}
