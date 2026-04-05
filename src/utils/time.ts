export function roundToMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Ensure a backend datetime string is parsed as UTC.
 *  SQLite drops timezone info, so strings arrive without a Z suffix. */
export function parseUTC(dateStr: string): Date {
  const s = dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr) ? dateStr : dateStr + 'Z'
  return new Date(s)
}

export function formatRelativeTime(dateStr: string, locale: string): string {
  const diff = Date.now() - parseUTC(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (locale === 'zh-CN') {
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    return `${days}天前`
  }
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function formatLocaleDate(dateStr: string, locale: string): string {
  const localeStr = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  return parseUTC(dateStr).toLocaleDateString(localeStr, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000)

  if (milliseconds === 1000) {
    const carrySeconds = wholeSeconds + 1
    const carryMinutes = minutes + Math.floor(carrySeconds / 60)
    const normalizedSeconds = carrySeconds % 60
    return `${carryMinutes}:${normalizedSeconds.toString().padStart(2, '0')}.000`
  }

  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}
