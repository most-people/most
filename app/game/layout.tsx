import '~/styles/zhajinhua.css'

export const metadata = {
  title: 'MostBox - 游戏',
  description: 'MostBox P2P 游戏牌桌',
}

export default function GameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
