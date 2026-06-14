import { createLazyFileRoute } from '@tanstack/react-router'

import AdminPage from '~/features/admin/AdminPage'

export const Route = createLazyFileRoute('/admin/')({
  component: AdminPage,
})
