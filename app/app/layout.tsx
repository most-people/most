import AppProvider from './AppProvider'

export const metadata = {
  title: 'MostBox',
  description: 'MostBox P2P 文件分享',
}

export default function AppRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppProvider>{children}</AppProvider>
}
