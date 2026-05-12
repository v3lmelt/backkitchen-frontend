/** @type {import('tailwindcss').Config} */
const colorVar = (name) => ({ opacityValue }) => (
  opacityValue === undefined
    ? `rgb(var(${name}))`
    : `rgb(var(${name}) / ${opacityValue})`
)

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '"Noto Sans SC"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"SimHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Noto Sans SC"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"SimHei"', 'ui-monospace', 'monospace', 'sans-serif'],
      },
      colors: {
        background: colorVar('--color-background'),
        card: colorVar('--color-card'),
        foreground: colorVar('--color-foreground'),
        'muted-foreground': colorVar('--color-muted-foreground'),
        border: colorVar('--color-border'),
        sidebar: colorVar('--color-sidebar'),
        'sidebar-accent': colorVar('--color-sidebar-accent'),
        overlay: colorVar('--color-overlay'),
        'primary-foreground': colorVar('--color-primary-foreground'),
        'button-primary': {
          DEFAULT: colorVar('--color-button-primary'),
          hover: colorVar('--color-button-primary-hover'),
          foreground: colorVar('--color-button-primary-foreground'),
        },
        primary: {
          DEFAULT: colorVar('--color-primary'),
          hover: colorVar('--color-primary-hover'),
          light: colorVar('--color-primary-light'),
          foreground: colorVar('--color-primary-foreground'),
        },
        cyan: {
          DEFAULT: colorVar('--color-cyan'),
          dark: colorVar('--color-cyan-dark'),
        },
        success: {
          DEFAULT: colorVar('--color-success'),
          bg: colorVar('--color-success-bg'),
        },
        warning: {
          DEFAULT: colorVar('--color-warning'),
          bg: colorVar('--color-warning-bg'),
        },
        error: {
          DEFAULT: colorVar('--color-error'),
          bg: colorVar('--color-error-bg'),
        },
        info: {
          DEFAULT: colorVar('--color-info'),
          bg: colorVar('--color-info-bg'),
        },
        'waveform-marker': colorVar('--color-waveform-marker'),
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
