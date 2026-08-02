import { createLazyFileRoute } from '@tanstack/react-router'

import DocsPage from '~/features/docs/DocsPage'

export const Route = createLazyFileRoute('/docs/')({
  component: DocsPage,
})
