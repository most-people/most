import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/docs/api/')({
  head: () => ({
    meta: [
      { title: `${translateMessage('docs.tabs.openapi')} · Most.Box` },
      {
        name: 'description',
        content: translateMessage('docs.openapi.desc'),
      },
    ],
  }),
})
