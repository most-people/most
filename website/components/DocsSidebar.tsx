import Link from 'next/link'

const sidebarLinks = [
  { href: '/docs/getting-started/', label: '安装指南' },
  { href: '/docs/remote-access/', label: '远程访问' },
  { href: '/docs/architecture/', label: '架构说明' },
]

export function DocsSidebar({ currentPath }: { currentPath: string }) {
  return (
    <aside className="docs-sidebar">
      <h4>文档</h4>
      <ul>
        {sidebarLinks.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={currentPath === link.href ? 'active' : ''}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}