import '~/styles/ping.css'

export const metadata = {
  title: 'MostBox - 网络连通性',
  description: '测试到全球主流网站的网络连通性和延迟',
}

export default function PingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
