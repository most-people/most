import { createLazyFileRoute } from '@tanstack/react-router'

import AppPage from '~/features/files/AppPage'

export const Route = createLazyFileRoute('/app/')({
  component: AppPage,
})
