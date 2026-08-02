import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export type DocsTab = 'mcp' | 'openapi'

export const Route = createFileRoute('/docs/')({
  validateSearch: (search: Record<string, unknown>): { tab: DocsTab } => ({
    tab: search.tab === 'openapi' ? 'openapi' : 'mcp',
  }),
  head: () => ({
    meta: [
      { title: translateMessage('docs.meta.title') },
      {
        name: 'description',
        content: translateMessage('docs.meta.desc'),
      },
    ],
  }),
})
