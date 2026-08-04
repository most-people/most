import { createLazyFileRoute } from '@tanstack/react-router'

import FuturePage from '~/features/future/FuturePage'

export const Route = createLazyFileRoute('/future/')({
  component: FuturePage,
})
