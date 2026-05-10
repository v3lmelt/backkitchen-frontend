const ALLOWED_CLIPBOARD_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

const WEAK_CLIPBOARD_IMAGE_NAME = /^(?:image|blob|clipboard)(?:\.(?:jpe?g|png|gif|webp))?$/i

let pastedImageCounter = 0

export interface ClipboardImageExtractionOptions {
  maxSizeBytes: number
  maxFiles?: number
  currentFileCount?: number
}

export interface ClipboardImageExtractionResult {
  files: File[]
  hasImageItems: boolean
  rejectedTooLarge: number
  rejectedUnsupported: number
  rejectedLimit: number
}

function formatDateStamp(date: Date): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function nextPastedImageName(mimeType: string): string {
  pastedImageCounter += 1
  const ext = ALLOWED_CLIPBOARD_IMAGE_TYPES.get(mimeType) ?? 'png'
  return `pasted-image-${formatDateStamp(new Date())}-${String(pastedImageCounter).padStart(3, '0')}.${ext}`
}

function shouldRenameClipboardFile(file: File): boolean {
  const name = file.name.trim()
  if (!name) return true
  return WEAK_CLIPBOARD_IMAGE_NAME.test(name)
}

function normalizeClipboardFile(file: File, mimeType: string): File {
  if (!shouldRenameClipboardFile(file)) return file
  return new File([file], nextPastedImageName(mimeType), {
    type: mimeType,
    lastModified: file.lastModified,
  })
}

export function extractClipboardImageFiles(
  event: ClipboardEvent,
  options: ClipboardImageExtractionOptions,
): ClipboardImageExtractionResult {
  const result: ClipboardImageExtractionResult = {
    files: [],
    hasImageItems: false,
    rejectedTooLarge: 0,
    rejectedUnsupported: 0,
    rejectedLimit: 0,
  }

  const items = event.clipboardData?.items
  if (!items) return result

  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY
  const currentFileCount = options.currentFileCount ?? 0

  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (!file) continue

    const mimeType = (item.type || file.type || '').toLowerCase()
    if (!mimeType.startsWith('image/')) continue

    result.hasImageItems = true

    if (!ALLOWED_CLIPBOARD_IMAGE_TYPES.has(mimeType)) {
      result.rejectedUnsupported += 1
      continue
    }

    if (file.size > options.maxSizeBytes) {
      result.rejectedTooLarge += 1
      continue
    }

    if (currentFileCount + result.files.length >= maxFiles) {
      result.rejectedLimit += 1
      continue
    }

    result.files.push(normalizeClipboardFile(file, mimeType))
  }

  return result
}
