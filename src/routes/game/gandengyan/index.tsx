import { createFileRoute } from '@tanstack/react-router'

import GanDengYanPage from '~/app/game/gandengyan/page'

export const Route = createFileRoute('/game/gandengyan/')({
  ssr: false,
  component: GanDengYanPage,
})
