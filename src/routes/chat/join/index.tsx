import { createFileRoute } from '@tanstack/react-router'

type ChatJoinSearch = {
  token?: string
  pub?: string
  fixture?: string
}

export const Route = createFileRoute('/chat/join/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ChatJoinSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    pub: typeof search.pub === 'string' ? search.pub : undefined,
    fixture: typeof search.fixture === 'string' ? search.fixture : undefined,
  }),
})
