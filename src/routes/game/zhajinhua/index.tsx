import { createFileRoute } from '@tanstack/react-router'

import ZhajinhuaPage from '~/features/game/zhajinhua/ZhajinhuaPage'

export const Route = createFileRoute('/game/zhajinhua/')({
  ssr: false,
  component: ZhajinhuaPage,
})
