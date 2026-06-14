import { createFileRoute } from '@tanstack/react-router'

import ChatPage from '~/features/chat/ChatPage'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  component: ChatPage,
})
