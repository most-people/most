import { createLazyFileRoute } from '@tanstack/react-router'

import ChatJoinPage from '~/features/chat/ChatJoinPage'

export const Route = createLazyFileRoute('/chat/join/')({
  component: ChatJoinPage,
})
