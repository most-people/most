import { createLazyFileRoute } from '@tanstack/react-router'

import ChatPage from '~/features/chat/ChatPage'

export const Route = createLazyFileRoute('/chat/')({
  component: ChatPage,
})
