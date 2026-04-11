import type { Metadata } from 'next'
import '../styles/globals.css'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

export const metadata: Metadata = {
  title: 'MostBox — P2P 文件分享',
  description: '基于 Hyperswarm 的去中心化文件分享工具。无需注册，不限速，开源免费。',
  openGraph: {
    title: 'MostBox — P2P 文件分享',
    description: '基于 Hyperswarm 的去中心化文件分享工具。无需注册，不限速，开源免费。',
    url: 'https://most.box',
    siteName: 'MostBox',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MostBox — P2P 文件分享',
    description: '基于 Hyperswarm 的去中心化文件分享工具。无需注册，不限速，开源免费。',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}