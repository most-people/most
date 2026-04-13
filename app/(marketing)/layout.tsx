import '../../styles/marketing.css'
import { Nav } from '../../components/Nav'
import { Footer } from '../../components/Footer'

export const metadata = {
  title: 'MostBox — P2P 文件分享',
  description: '基于 Hyperswarm 的去中心化文件分享工具。无需注册，不限速，开源免费。',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  )
}