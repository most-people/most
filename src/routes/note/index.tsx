import { createFileRoute } from '@tanstack/react-router'

type NoteSearch = {
  cid?: string
  file?: string
  path?: string
  chatDraft?: string
  mode?: 'edit'
}

export const Route = createFileRoute('/note/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): NoteSearch => ({
    cid: typeof search.cid === 'string' ? search.cid : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
    path: typeof search.path === 'string' ? search.path : undefined,
    chatDraft:
      typeof search.chatDraft === 'string' ? search.chatDraft : undefined,
    mode: search.mode === 'edit' ? 'edit' : undefined,
  }),
})
