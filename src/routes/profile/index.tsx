import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/profile/')({
  ssr: false,
  head: () => ({
    meta: [
      { title: translateMessage('profile.meta.title') },
      {
        name: 'description',
        content: translateMessage('profile.meta.desc'),
      },
    ],
  }),
})
