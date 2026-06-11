import { createFileRoute } from '@tanstack/react-router'

import NotePage from '~/app/note/page'

export const Route = createFileRoute('/note/')({
  ssr: false,
  component: NotePage,
})
