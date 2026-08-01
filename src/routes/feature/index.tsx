import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/feature/')({
  head: () => ({
    meta: [
      { title: translateMessage('feature.meta.title') },
      {
        name: 'description',
        content: translateMessage('feature.meta.desc'),
      },
    ],
  }),
})
