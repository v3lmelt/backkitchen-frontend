import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear any leftover toasts from other tests
    const { toasts } = useToast()
    toasts.value.splice(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a toast with correct type and message', () => {
    const { success, toasts } = useToast()
    success('Saved!')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('success')
    expect(toasts.value[0].message).toBe('Saved!')
  })

  it('provides shorthand methods for all types', () => {
    const toast = useToast()
    toast.success('ok')
    toast.error('fail')
    toast.warning('warn')
    toast.info('note')
    expect(toast.toasts.value).toHaveLength(4)
    expect(toast.toasts.value.map(t => t.type)).toEqual(['success', 'error', 'warning', 'info'])
  })

  it('auto-removes toasts after duration', () => {
    const { success, toasts } = useToast()
    success('temp', 2000)
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(2000)
    expect(toasts.value).toHaveLength(0)
  })

  it('does not auto-remove if duration is 0', () => {
    const { error, toasts } = useToast()
    error('persistent', 0)
    vi.advanceTimersByTime(10000)
    expect(toasts.value).toHaveLength(1)
  })

  it('removeToast removes a specific toast', () => {
    const { success, info, removeToast, toasts } = useToast()
    const id1 = success('first', 0)
    info('second', 0)
    expect(toasts.value).toHaveLength(2)

    removeToast(id1)
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].message).toBe('second')
  })

  it('removeToast is a no-op for unknown ids', () => {
    const { success, removeToast, toasts } = useToast()
    success('only', 0)
    removeToast(99999)
    expect(toasts.value).toHaveLength(1)
  })
})
