import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/about/')({
  head: () => ({
    meta: [
      { title: translateMessage('about.meta.title') },
      {
        name: 'description',
        content: translateMessage('about.meta.desc'),
      },
    ],
  }),
})
