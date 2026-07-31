import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/note/decrypt/')({
  ssr: false,
  head: () => ({
    meta: [{ title: '旧加密笔记迁移 - MostBox' }],
  }),
})
