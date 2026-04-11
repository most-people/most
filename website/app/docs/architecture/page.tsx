import { DocsSidebar } from '../../../components/DocsSidebar'

export default function Architecture() {
  return (
    <div className="container">
      <div className="docs-layout">
        <DocsSidebar currentPath="/docs/architecture/" />
        <div className="docs-content">
          <h1>架构说明</h1>

          <p>MostBox 的核心是一个 P2P 文件分享系统，基于以下技术栈构建。</p>

          <h2>整体架构</h2>
          <pre><code>{`用户 A (MostBox)  ←──P2P 复制──→  用户 B (MostBox)
      ↑                                    ↑
  WebSocket ←─── 事件推送 ───→ WebSocket
      ↑                                    ↑
   浏览器                               浏览器`}</code></pre>
          <p>每个用户运行独立的 MostBox 服务器实例，通过 Hyperswarm P2P 网络复制数据。WebSocket 用于浏览器与服务器的实时通信。</p>

          <h2>核心组件</h2>

          <h3>MostBoxEngine</h3>
          <p>核心引擎类，管理所有功能模块：文件发布、下载、频道聊天、P2P 连接。</p>

          <h3>Hyperswarm</h3>
          <p>P2P 网络发现与连接。当用户发布文件或加入频道时，Hyperswarm 自动在 DHT 中查找对等节点并建立加密连接。</p>

          <h3>Hyperdrive</h3>
          <p>分布式文件系统。存储发布的文件内容，支持从 P2P 网络按需读取数据块。</p>

          <h3>Corestore</h3>
          <p>Hypercore 存储管理器。为每个功能（文件存储、频道消息等）提供独立的命名空间。</p>

          <h3>Hypercore</h3>
          <p>单条 append-only 日志。频道聊天消息通过 Hypercore 存储，新消息 append 到尾部，P2P 复制时同步增量。</p>

          <h2>CID 计算</h2>
          <p>采用标准 IPFS UnixFS Chunking 算法计算 CID v1。相同文件内容生成一致的 CID，确保：</p>
          <ul>
            <li><strong>确定性链接</strong> — 同一文件在不同节点上发布，CID 完全相同</li>
            <li><strong>完整性校验</strong> — 下载后验证 CID，防止数据篡改</li>
            <li><strong>去重</strong> — 相同文件只需发布一次</li>
          </ul>

          <h2>most:// 协议</h2>
          <p>MostBox 自定义的分享链接格式：</p>
          <pre><code>most://&lt;CID&gt;</code></pre>
          <p>接收方将链接粘贴到 MostBox 中，系统解析 CID 并从 P2P 网络下载文件。</p>

          <h2>频道聊天</h2>
          <h3>消息流程</h3>
          <ol>
            <li>客户端 POST 消息 → <code>core.append()</code> 写入本地</li>
            <li>P2P 复制到远程节点 → <code>core.on(&apos;append&apos;)</code> 收到</li>
            <li><code>emit(&apos;channel:message&apos;)</code> → WebSocket 推送给订阅者</li>
          </ol>

          <h3>P2P 复制</h3>
          <p>当双方加入同一频道时：</p>
          <pre><code>{`if (theirChannels.has(name)) {
  const ns = this.#store.namespace(\`channel-\${name}\`)
  ns.replicate(conn)
}`}</code></pre>
          <p>只为共同频道建立复制流，避免不必要的带宽消耗。</p>

          <h2>API 端点</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>方法</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>路径</th>
                <th style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>GET</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>/api/files</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-secondary)' }}>列出已发布文件</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>POST</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>/api/publish</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-secondary)' }}>上传文件</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>POST</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>/api/download</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-secondary)' }}>下载分享的文件</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>GET</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>/api/network</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-secondary)' }}>网络地址信息</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>WS</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>/ws</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-secondary)' }}>WebSocket 实时事件</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}