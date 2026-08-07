import { createLazyFileRoute } from '@tanstack/react-router'

import HiPage from '~/features/hi/HiPage'

export const Route = createLazyFileRoute('/hi/')({
  component: HiPage,
})
