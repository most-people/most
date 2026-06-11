import { createFileRoute } from '@tanstack/react-router'

import ChatJoinPage from '~/app/chat/join/page'

export const Route = createFileRoute('/chat/join/')({
  ssr: false,
  component: ChatJoinPage,
})
