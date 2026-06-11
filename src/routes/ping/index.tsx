import { createFileRoute } from '@tanstack/react-router'

import PingPage from '~/app/ping/page'

export const Route = createFileRoute('/ping/')({
  head: () => ({
    meta: [
      { title: 'MostBox - 网络连通性' },
      {
        name: 'description',
        content: '测试到全球主流网站的网络连通性和延迟',
      },
    ],
  }),
  component: PingPage,
})
