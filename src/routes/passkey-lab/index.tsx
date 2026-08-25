import { createFileRoute } from '@tanstack/react-router'

import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/passkey-lab/')({
  head: () => ({
    meta: [
      { title: translateMessage('passkey.meta.title') },
      {
        name: 'description',
        content: translateMessage('passkey.meta.desc'),
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
})
