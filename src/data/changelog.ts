export const CHANGELOG_SEEN_KEY = 'backkitchen_changelog_seen'
export const CHANGELOG_SEEN_EVENT = 'backkitchen:changelog-seen'

import { CHANGELOG } from './changelog.generated'
import type { LocalizedText } from './changelog.schema'

export type {
  ChangelogLocale,
  LocalizedText,
  ChangelogItem,
  ChangelogSection,
  ChangelogEntry,
} from './changelog.schema'

export { CHANGELOG } from './changelog.generated'

export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? ''

export function pickLocalized(text: LocalizedText, locale: string): string {
  return locale === 'en' ? text.en : text['zh-CN']
}
