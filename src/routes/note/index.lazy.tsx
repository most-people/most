import { createLazyFileRoute } from '@tanstack/react-router'

import NotePage from '~/features/note/NotePage'

export const Route = createLazyFileRoute('/note/')({
  component: NotePage,
})
