import { describe, expect, it } from 'vitest'

import { AUDIO_ACCEPT, IMAGE_ACCEPT, MAX_AUDIOS, MAX_AUDIO_SIZE, MAX_IMAGES, MAX_IMAGE_SIZE } from './uploadLimits'

// Contract mirror of the backend's allowed audio formats
// (`backend/app/config.py`: ALLOWED_AUDIO_TYPES + ALLOWED_AUDIO_EXTENSIONS).
// Keep these arrays in sync with the backend constants.
const BACKEND_ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
  'audio/aac',
  'audio/ogg',
  'audio/x-flac',
  'audio/x-wav',
]

const BACKEND_ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma']

describe('uploadLimits', () => {
  it('exposes the documented size and count limits', () => {
    expect(MAX_AUDIO_SIZE).toBe(200 * 1024 * 1024)
    expect(MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024)
    expect(MAX_AUDIOS).toBe(3)
    expect(MAX_IMAGES).toBe(3)
  })

  it('AUDIO_ACCEPT covers every backend-allowed audio MIME type and extension', () => {
    const acceptParts = AUDIO_ACCEPT.split(',').map(part => part.trim().toLowerCase())
    for (const mime of BACKEND_ALLOWED_AUDIO_MIME_TYPES) {
      expect(acceptParts).toContain(mime.toLowerCase())
    }
    for (const ext of BACKEND_ALLOWED_AUDIO_EXTENSIONS) {
      expect(acceptParts).toContain(ext.toLowerCase())
    }
  })

  it('IMAGE_ACCEPT lists common raster image formats', () => {
    for (const part of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', '.jpg', '.jpeg', '.png', '.gif', '.webp']) {
      expect(IMAGE_ACCEPT.split(',').map(p => p.trim().toLowerCase())).toContain(part)
    }
  })
})
