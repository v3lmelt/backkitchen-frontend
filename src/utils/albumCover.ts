export const ALBUM_COVER_MAX_SIZE = 20 * 1024 * 1024
export const ALBUM_COVER_MAX_SIZE_LABEL = '20 MB'
export const ALBUM_COVER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'

const ALLOWED_ALBUM_COVER_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])
const ALLOWED_ALBUM_COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

export type AlbumCoverValidationError = 'unsupportedType' | 'tooLarge'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.')
  return index >= 0 ? filename.slice(index).toLowerCase() : ''
}

export function validateAlbumCoverFile(file: File): AlbumCoverValidationError | null {
  const ext = getExtension(file.name)

  if (file.type && !ALLOWED_ALBUM_COVER_TYPES.has(file.type)) {
    return 'unsupportedType'
  }
  if (!ext || !ALLOWED_ALBUM_COVER_EXTENSIONS.includes(ext)) {
    return 'unsupportedType'
  }
  if (file.size > ALBUM_COVER_MAX_SIZE) {
    return 'tooLarge'
  }
  return null
}

export function localizeAlbumCoverValidationError(error: AlbumCoverValidationError, t: TranslateFn): string {
  if (error === 'tooLarge') {
    return t('upload.fileTooLarge', { max: ALBUM_COVER_MAX_SIZE_LABEL })
  }
  return t('upload.unsupportedImageType')
}

export function localizeAlbumCoverUploadError(message: string | undefined, t: TranslateFn): string {
  const trimmed = message?.trim()
  if (!trimmed) {
    return t('common.uploadFailed')
  }
  if (
    trimmed === 'Only JPEG, PNG, WebP, and GIF images are allowed.' ||
    trimmed.startsWith('Unsupported image extension:')
  ) {
    return t('upload.unsupportedImageType')
  }

  const tooLarge = trimmed.match(/File too large\. Maximum size is (\d+) MB\.?/i)
  if (tooLarge) {
    return t('upload.fileTooLarge', { max: `${tooLarge[1]} MB` })
  }

  return trimmed
}
