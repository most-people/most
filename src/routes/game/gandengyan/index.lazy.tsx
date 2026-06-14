import { createLazyFileRoute } from '@tanstack/react-router'

import GanDengYanPage from '~/features/game/gandengyan/GanDengYanPage'

export const Route = createLazyFileRoute('/game/gandengyan/')({
  component: GanDengYanPage,
})
