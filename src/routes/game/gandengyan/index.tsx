import { createFileRoute } from '@tanstack/react-router'

import GanDengYanPage from '~/features/game/gandengyan/GanDengYanPage'

export const Route = createFileRoute('/game/gandengyan/')({
  ssr: false,
  component: GanDengYanPage,
})
