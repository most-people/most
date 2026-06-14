import { createFileRoute } from '@tanstack/react-router'

import NotePage from '~/features/note/NotePage'

type NoteSearch = {
  cid?: string
  mode?: 'edit'
}

export const Route = createFileRoute('/note/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): NoteSearch => ({
    cid: typeof search.cid === 'string' ? search.cid : undefined,
    mode: search.mode === 'edit' ? 'edit' : undefined,
  }),
  component: NotePage,
})
