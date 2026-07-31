import { createLazyFileRoute } from '@tanstack/react-router'
import NoteDecryptionMigrationPage from '~/features/note/NoteDecryptionMigrationPage'

export const Route = createLazyFileRoute('/note/decrypt/')({
  component: NoteDecryptionMigrationPage,
})
