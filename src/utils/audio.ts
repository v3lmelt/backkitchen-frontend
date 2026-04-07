/**
 * Extract audio duration from a File using the browser's built-in audio decoder.
 * Works with MP3, WAV, FLAC, OGG, AAC, and M4A.
 */
export function extractAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url)
      resolve(audio.duration)
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to extract audio duration'))
    })
    audio.src = url
  })
}
