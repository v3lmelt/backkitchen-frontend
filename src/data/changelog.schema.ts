export type ChangelogLocale = 'zh-CN' | 'en'
export type LocalizedText = Record<ChangelogLocale, string>

export interface ChangelogItem {
  title: LocalizedText
  description?: LocalizedText
}

export interface ChangelogSection {
  heading: LocalizedText
  items: ChangelogItem[]
}

export interface ChangelogEntry {
  version: string
  date: string
  headline: LocalizedText
  summary: LocalizedText
  sections: ChangelogSection[]
}
