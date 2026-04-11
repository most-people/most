'use client'

import { useState } from 'react'

const faqItems = [
  {
    q: '文件存在哪里？',
    a: '文件以 P2P 方式存储在分享者和接收者的设备上。内容分片存储在 P2P 网络中，没有中心化服务器。',
  },
  {
    q: '如何分享文件给其他人？',
    a: '上传文件后点击「复制链接」，将 most:// 链接发给朋友。对方安装 MostBox 后粘贴链接即可下载。',
  },
  {
    q: '支持大文件吗？',
    a: '支持。已测试通过 GB 级别的大文件传输，采用流式处理，内存占用低。',
  },
  {
    q: 'most:// 链接是什么？',
    a: 'most:// 是 MostBox 自定义的协议链接，格式为 most://<CID>。相同文件生成一致的 CID 链接，一次发布永久有效。',
  },
  {
    q: '如何远程访问？',
    a: '局域网内直接用 IP 访问。远程可通过 Tailscale 组虚拟局域网，或用 Cloudflare Tunnel 获得公网 HTTPS 地址。',
  },
  {
    q: '数据安全吗？',
    a: 'MostBox 是完全开源的（MIT 协议），所有代码可在 GitHub 审计。数据不上传到任何中心服务器，P2P 传输加密。',
  },
]

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="section">
      <div className="container">
        <h2 className="heading-section">常见问题</h2>
        <div className="faq-list">
          {faqItems.map((item, i) => (
            <div key={i} className={`faq-item ${openIndex === i ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenIndex(openIndex === i ? null : i)}>
                <span>{item.q}</span>
                <span className="faq-icon"><PlusIcon /></span>
              </button>
              {openIndex === i && (
                <div className="faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}