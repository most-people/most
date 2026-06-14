import { createFileRoute } from '@tanstack/react-router'

import PingPage from '~/features/ping/PingPage'
import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/ping/')({
  head: () => ({
    meta: [
      { title: translateMessage('ping.meta.title') },
      {
        name: 'description',
        content: translateMessage('ping.meta.desc'),
      },
    ],
  }),
  component: PingPage,
})
