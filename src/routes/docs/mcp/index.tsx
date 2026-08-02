import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/docs/mcp/')({
  head: () => ({
    meta: [
      { title: `${translateMessage('docs.tabs.mcp')} · Most.Box` },
      {
        name: 'description',
        content: translateMessage('docs.mcp.overview.desc'),
      },
    ],
  }),
})
