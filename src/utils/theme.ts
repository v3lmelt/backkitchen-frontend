export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'backkitchen_theme'
export const THEME_CHANGED_EVENT = 'backkitchen:theme-changed'
export const DEFAULT_THEME: ThemeMode = 'dark'

export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

export function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME

  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemeMode): ThemeMode {
  const normalized = normalizeTheme(theme)
  if (typeof document === 'undefined') return normalized

  const root = document.documentElement
  root.dataset.theme = normalized
  root.classList.toggle('dark', normalized === 'dark')
  root.classList.toggle('light', normalized === 'light')
  return normalized
}

export function setTheme(theme: ThemeMode): ThemeMode {
  const normalized = applyTheme(theme)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized)
  } catch {
    // Ignore storage failures; the applied document theme is still usable.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: normalized }))
  }

  return normalized
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  return setTheme(current === 'dark' ? 'light' : 'dark')
}

export function initializeTheme(): ThemeMode {
  return applyTheme(readStoredTheme())
}
