import { createLazyFileRoute } from '@tanstack/react-router'

import DownloadPage from '~/features/download/DownloadPage'

export const Route = createLazyFileRoute('/download/')({
  component: DownloadPage,
})
