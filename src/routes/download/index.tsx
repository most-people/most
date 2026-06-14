import { createFileRoute } from '@tanstack/react-router'

import DownloadPage from '~/app/download/page'
import { translateMessage } from '~/lib/i18n'

export const Route = createFileRoute('/download/')({
  head: () => ({
    meta: [
      { title: translateMessage('download.meta.title') },
      {
        name: 'description',
        content: translateMessage('download.meta.desc'),
      },
    ],
  }),
  component: DownloadPage,
})
