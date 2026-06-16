import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/cid/$cid/')({
  ssr: false,
  head: () => ({
    meta: [
      { title: translateMessage('cid.meta.title') },
      {
        name: 'description',
        content: translateMessage('cid.meta.desc'),
      },
    ],
  }),
})
