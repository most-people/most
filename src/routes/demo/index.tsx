import { createFileRoute } from '@tanstack/react-router'

import DemoPage from '~/features/demo/DemoPage'

export const Route = createFileRoute('/demo/')({
  ssr: false,
  component: DemoPage,
})
