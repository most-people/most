import { createLazyFileRoute } from '@tanstack/react-router'

import { ApiDocsPage } from '~/features/docs/DocsPage'

export const Route = createLazyFileRoute('/docs/api/')({
  component: ApiDocsPage,
})
