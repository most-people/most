import { DocsSidebar } from '../../../../components/DocsSidebar'

export const metadata = {
  title: '安装指南 - MostBox',
  description: 'MostBox 安装与使用指南。',
}

export default function GettingStarted() {
  return (
    <div className="mkt-container">
      <div className="mkt-docs-layout">
        <DocsSidebar currentPath="/docs/getting-started/" />
        <div className="mkt-docs-content">
          <h1>安装与使用</h1>

          <h2>前置要求</h2>
          <p>MostBox 需要 Node.js 18 或更高版本。</p>
          <ul>
            <li><a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">下载 Node.js</a></li>
          </ul>

          <h2>一行命令启动</h2>
          <p>无需安装，直接运行：</p>
          <pre><code>npx most-box@latest</code></pre>
          <p>浏览器会自动打开 <code>http://127.0.0.1:1976</code>。</p>
          <p>使用 <code>@latest</code> 确保每次运行最新版本。</p>

          <h2>开发模式</h2>
          <p>如果你想在本地开发 MostBox：</p>
          <pre><code>{`git clone https://github.com/most-people/most.git\ncd most\nnpm install\nnpm run dev     # 终端 1：Next.js 开发服务器 (端口 3000)\nnode server.js  # 终端 2：后端 API 服务器 (端口 1976)`}</code></pre>

          <h2>内网访问</h2>
          <p>默认情况下 MostBox 监听所有网络接口。同一局域网的其他设备可以直接通过 IP 访问。</p>
          <p>在设置页面可以查看所有可访问的网络地址（本机、局域网、Tailscale、ZeroTier）。</p>

          <h2>环境变量</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>变量</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>默认值</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}><code>MOSTBOX_HOST</code></td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)' }}><code>0.0.0.0</code></td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)' }}>监听地址</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}><code>MOSTBOX_PORT</code></td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)' }}><code>1976</code></td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-text-secondary)' }}>监听端口</td>
              </tr>
            </tbody>
          </table>

          <h2>Docker</h2>
          <pre><code>docker run -p 1976:1976 most-box</code></pre>
          <p>或使用 Docker Compose：</p>
          <pre><code>docker compose up -d</code></pre>

          <h2>下一步</h2>
          <ul>
            <li><a href="/docs/remote-access/">远程访问指南</a> — 从外部网络访问 MostBox</li>
            <li><a href="/docs/architecture/">架构说明</a> — 了解 P2P 网络工作原理</li>
          </ul>
        </div>
      </div>
    </div>
  )
}