import { createFileRoute } from '@tanstack/react-router'

import AppPage from '~/app/app/page'

export const Route = createFileRoute('/app/')({
  ssr: false,
  component: AppPage,
})
