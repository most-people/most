import { createLazyFileRoute } from '@tanstack/react-router'

import CidPage from '~/features/cid/CidPage'

export const Route = createLazyFileRoute('/cid/$cid/')({
  component: CidPage,
})
