import { createLazyFileRoute } from '@tanstack/react-router'

import FriendPage from '~/features/friend/FriendPage'

export const Route = createLazyFileRoute('/friend/')({
  component: FriendPage,
})
