import { DocsSidebar } from '../../../../components/DocsSidebar'

export const metadata = {
  title: '远程访问 - MostBox',
  description: 'MostBox 远程访问指南：局域网、Tailscale、ZeroTier、Cloudflare Tunnel、Caddy。',
}

export default function RemoteAccess() {
  return (
    <div className="mkt-container">
      <div className="mkt-docs-layout">
        <DocsSidebar currentPath="/docs/remote-access/" />
        <div className="mkt-docs-content">
          <h1>远程访问</h1>

          <p>MostBox 默认监听所有网络接口，同一网络内的设备可以直接通过 IP 地址访问。</p>
          <p>以下是几种从外部网络访问 MostBox 的方式。</p>

          <h2>局域网直接访问</h2>
          <p>最简单的方式。确保你的设备和目标设备在同一 WiFi 下。</p>
          <ol>
            <li>启动 MostBox</li>
            <li>在设置页面查看「局域网」地址，或运行 <code>ipconfig</code>（Windows）/ <code>ifconfig</code>（macOS/Linux）</li>
            <li>在其他设备的浏览器中输入 <code>http://&lt;IP&gt;:1976</code></li>
          </ol>

          <h2>Tailscale</h2>
          <p><a href="https://tailscale.com" target="_blank" rel="noopener noreferrer">Tailscale</a> 是最推荐的远程访问方案。安装后自动组建虚拟局域网，手机也能用。</p>
          <ol>
            <li>在两台设备上安装 Tailscale</li>
            <li>登录同一个 Tailscale 账号</li>
            <li>启动 MostBox</li>
            <li>在设置页面查看「Tailscale」地址</li>
            <li>从远程设备访问 <code>http://&lt;Tailscale-IP&gt;:1976</code></li>
          </ol>
          <p>优势：P2P 直连，速度快，免费版支持 100 台设备，无需公网 IP。</p>

          <h2>ZeroTier</h2>
          <p><a href="https://www.zerotier.com" target="_blank" rel="noopener noreferrer">ZeroTier</a> 类似 Tailscale，创建虚拟局域网。</p>
          <ol>
            <li>创建 ZeroTier 网络</li>
            <li>在两台设备上安装 ZeroTier 并加入网络</li>
            <li>在管理面板授权设备</li>
            <li>通过 ZeroTier IP 访问 MostBox</li>
          </ol>
          <p>免费版支持 25 台设备。</p>

          <h2>Cloudflare Tunnel</h2>
          <p>如果你想通过公网域名访问，可以使用 Cloudflare Tunnel。</p>
          <ol>
            <li>安装 <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noopener noreferrer">cloudflared</a></li>
            <li>运行：</li>
          </ol>
          <pre><code>cloudflared tunnel --url http://localhost:1976</code></pre>
          <p>Cloudflare 会自动生成一个 <code>https://xxx.trycloudflare.com</code> 地址，分享给朋友即可访问。免费、自动 HTTPS、无需公网 IP。</p>

          <h2>Caddy 反向代理</h2>
          <p>如果你有公网 VPS 和域名，可以用 Caddy 做反向代理：</p>
          <pre><code>{`mostbox.example.com {\n  reverse_proxy localhost:1976\n}`}</code></pre>
          <p>Caddy 会自动申请和续期 Let&apos;s Encrypt 证书。</p>
        </div>
      </div>
    </div>
  )
}