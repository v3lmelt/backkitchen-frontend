/** Shared upload constraints for audio/image attachments. */

export const MAX_AUDIO_SIZE = 200 * 1024 * 1024 // 200 MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_AUDIOS = 3
export const MAX_IMAGES = 3
// Mirrors backend `ALLOWED_AUDIO_TYPES` + `ALLOWED_AUDIO_EXTENSIONS`
// (`backend/app/config.py`) so the file picker never filters out a format the
// server accepts. Includes the legacy `audio/x-flac` / `audio/x-wav` MIME
// types some browsers send, plus `.m4a` / `.wma` extensions the backend allows.
export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,audio/x-flac,audio/x-wav,.mp3,.wav,.flac,.aac,.ogg,.m4a,.wma'
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp'
