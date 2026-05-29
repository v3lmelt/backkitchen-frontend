import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  },
})
