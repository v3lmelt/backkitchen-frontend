import type { ComposerTranslation } from 'vue-i18n'
import type { ChecklistTemplateItem } from '@/types'

/**
 * Peer-review checklist helpers — single source of truth for the default
 * template and the i18n mapping of the built-in checklist labels.
 */

const defaultChecklistLabelKeyMap: Record<string, string> = {
  Arrangement: 'arrangement',
  Balance: 'balance',
  'Low-End': 'lowEnd',
  'Stereo Image': 'stereoImage',
  'Technical Cleanliness': 'technicalCleanliness',
}

export const defaultPeerChecklistTemplateItems: ChecklistTemplateItem[] = [
  { label: 'Arrangement', required: true, sort_order: 0 },
  { label: 'Balance', required: true, sort_order: 1 },
  { label: 'Low-End', required: true, sort_order: 2 },
  { label: 'Stereo Image', required: true, sort_order: 3 },
  { label: 'Technical Cleanliness', required: true, sort_order: 4 },
]

/** Translate a built-in checklist label; custom labels render as-is. */
export function translateChecklistLabel(label: string, t: ComposerTranslation): string {
  const key = defaultChecklistLabelKeyMap[label]
  return key ? t(`checklistLabels.${key}`) : label
}
