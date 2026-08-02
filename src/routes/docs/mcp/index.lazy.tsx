import { createLazyFileRoute } from '@tanstack/react-router'

import { McpDocsPage } from '~/features/docs/DocsPage'

export const Route = createLazyFileRoute('/docs/mcp/')({
  component: McpDocsPage,
})
