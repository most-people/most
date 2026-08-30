import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { requiredStaticRoutes } from './scripts/static-routes.mjs'

export default defineConfig({
  plugins: [
    tanstackStart({
      pages: requiredStaticRoutes.map(path => ({ path })),
      spa: {
        enabled: true,
      },
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: true,
        autoSubfolderIndex: true,
        concurrency: 1,
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
    host: '127.0.0.1',
    port: 3000,
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'scalar',
              test: /node_modules[\\/]@scalar[\\/]/,
              priority: 20,
              minSize: 40 * 1024,
              maxSize: 400 * 1024,
              includeDependenciesRecursively: false,
            },
            {
              name: 'editor',
              test: /node_modules[\\/](?:@milkdown|@codemirror|codemirror|katex|prosemirror-)/,
              priority: 10,
              minSize: 40 * 1024,
              maxSize: 400 * 1024,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
})
