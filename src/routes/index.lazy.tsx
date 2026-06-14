import { createLazyFileRoute } from '@tanstack/react-router'

import HomePage from '~/features/portal/HomePage'

export const Route = createLazyFileRoute('/')({
  component: HomePage,
})
