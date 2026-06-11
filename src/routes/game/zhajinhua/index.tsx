import { createFileRoute } from '@tanstack/react-router'

import ZhajinhuaPage from '~/app/game/zhajinhua/page'

export const Route = createFileRoute('/game/zhajinhua/')({
  ssr: false,
  component: ZhajinhuaPage,
})
