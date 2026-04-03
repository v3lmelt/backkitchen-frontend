export function roundToMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000
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
