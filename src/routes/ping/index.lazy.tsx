import { createLazyFileRoute } from '@tanstack/react-router'

import PingPage from '~/features/ping/PingPage'

export const Route = createLazyFileRoute('/ping/')({
  component: PingPage,
})
