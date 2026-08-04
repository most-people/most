import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/future/')({
  head: () => ({
    meta: [
      { title: translateMessage('future.meta.title') },
      {
        name: 'description',
        content: translateMessage('future.meta.desc'),
      },
    ],
  }),
})
