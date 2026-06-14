import { createFileRoute } from '@tanstack/react-router'

import HomePage from '~/features/portal/HomePage'

export const Route = createFileRoute('/')({
  component: HomePage,
})
