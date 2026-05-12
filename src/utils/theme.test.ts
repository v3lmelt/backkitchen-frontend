import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME,
  THEME_CHANGED_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  initializeTheme,
  normalizeTheme,
  readStoredTheme,
  setTheme,
  toggleTheme,
} from './theme'

describe('theme utilities', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark', 'light')
  })

  it('defaults invalid or missing values to dark', () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME)
    expect(normalizeTheme('system')).toBe(DEFAULT_THEME)
    expect(readStoredTheme()).toBe(DEFAULT_THEME)

    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readStoredTheme()).toBe(DEFAULT_THEME)
  })

  it('applies a theme to the document element', () => {
    applyTheme('light')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('initializes from localStorage without rewriting the stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    expect(initializeTheme()).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('persists theme changes and announces them', () => {
    const listener = vi.fn()
    window.addEventListener(THEME_CHANGED_EVENT, listener)

    setTheme('light')

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as CustomEvent<unknown>).detail).toBe('light')

    window.removeEventListener(THEME_CHANGED_EVENT, listener)
  })

  it('toggles between dark and light', () => {
    expect(toggleTheme('dark')).toBe('light')
    expect(toggleTheme('light')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
