import { createFileRoute } from '@tanstack/react-router'

import ChatPage from '~/app/chat/page'

export const Route = createFileRoute('/chat/')({
  ssr: false,
  component: ChatPage,
})
