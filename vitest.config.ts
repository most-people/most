import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~server': fileURLToPath(new URL('./server', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'src/tests/**/*.test.ts',
      'src/tests/**/*.test.tsx',
      'packages/protocol/test/**/*.test.js',
    ],
    globals: false,
    restoreMocks: true,
  },
})
