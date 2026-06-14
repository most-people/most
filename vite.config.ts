import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { requiredStaticRoutes } from './scripts/static-routes.mjs'

export default defineConfig({
  plugins: [
    tanstackStart({
      pages: requiredStaticRoutes.map(path => ({ path })),
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: true,
        autoSubfolderIndex: true,
        crawlLinks: true,
        failOnError: true,
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      '~server': fileURLToPath(new URL('./server', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
})
