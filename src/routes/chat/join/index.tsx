import { createFileRoute } from '@tanstack/react-router'

import ChatJoinPage from '~/app/chat/join/page'

type ChatJoinSearch = {
  token?: string
  pub?: string
}

export const Route = createFileRoute('/chat/join/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ChatJoinSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    pub: typeof search.pub === 'string' ? search.pub : undefined,
  }),
  component: ChatJoinPage,
})
