import { createLazyFileRoute } from '@tanstack/react-router'

import ZhajinhuaPage from '~/features/game/zhajinhua/ZhajinhuaPage'

export const Route = createLazyFileRoute('/game/zhajinhua/')({
  component: ZhajinhuaPage,
})
