/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '"Noto Sans SC"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', '"SimHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace', '"Microsoft YaHei"', '"PingFang SC"', '"Hiragino Sans GB"', 'sans-serif'],
      },
      colors: {
        background: '#111111',
        card: '#1A1A1A',
        foreground: '#FFFFFF',
        'muted-foreground': '#B8B9B6',
        border: '#2E2E2E',
        sidebar: '#18181b',
        'sidebar-accent': '#2a2a30',
        primary: {
          DEFAULT: '#FF8400',
          hover: '#CC6A00',
          light: '#FFB366',
        },
        cyan: {
          DEFAULT: '#22D3EE',
          dark: '#0891B2',
        },
        success: {
          DEFAULT: '#B6FFCE',
          bg: '#222924',
        },
        warning: {
          DEFAULT: '#FF8400',
          bg: '#291C0F',
        },
        error: {
          DEFAULT: '#FF5C33',
          bg: '#24100B',
        },
        info: {
          DEFAULT: '#B2B2FF',
          bg: '#222229',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
