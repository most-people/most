import { createLazyFileRoute } from '@tanstack/react-router'

import DemoPage from '~/features/demo/DemoPage'

export const Route = createLazyFileRoute('/demo/')({
  component: DemoPage,
})
