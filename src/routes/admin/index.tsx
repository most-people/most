import { createFileRoute } from '@tanstack/react-router'

import AdminPage from '~/app/admin/page'

export const Route = createFileRoute('/admin/')({
  ssr: false,
  component: AdminPage,
})
