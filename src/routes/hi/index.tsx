import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/hi/')({
  head: () => ({
    meta: [
      { title: translateMessage('hi.meta.title') },
      {
        name: 'description',
        content: translateMessage('hi.meta.desc'),
      },
    ],
  }),
})
