import { createFileRoute } from '@tanstack/react-router'

import AppPage from '~/features/files/AppPage'

export const Route = createFileRoute('/app/')({
  ssr: false,
  component: AppPage,
})
