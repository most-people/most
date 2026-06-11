import { createFileRoute } from '@tanstack/react-router'

import DemoPage from '~/app/demo/page'

export const Route = createFileRoute('/demo/')({
  ssr: false,
  component: DemoPage,
})
