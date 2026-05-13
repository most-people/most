import '~/styles/admin.css'

export const metadata = {
  title: 'MostBox 节点管理台',
  description: 'MostBox daemon 节点状态、策略与日志',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
