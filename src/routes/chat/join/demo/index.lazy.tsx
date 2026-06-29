import { createLazyFileRoute } from '@tanstack/react-router'

import ChatJoinDemoPage from '~/features/chat/ChatJoinDemoPage'

export const Route = createLazyFileRoute('/chat/join/demo/')({
  component: ChatJoinDemoPage,
})
