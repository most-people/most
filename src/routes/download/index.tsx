import { createFileRoute } from '@tanstack/react-router'

import DownloadPage from '~/app/download/page'

export const Route = createFileRoute('/download/')({
  head: () => ({
    meta: [
      { title: '下载 MostBox 桌面客户端' },
      {
        name: 'description',
        content:
          '下载 MostBox 桌面客户端，获得完整的 P2P 文件分享、下载校验和持续做种能力',
      },
    ],
  }),
  component: DownloadPage,
})
