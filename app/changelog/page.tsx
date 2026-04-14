'use client'

import { Nav } from '../../components/Nav'
import { Footer } from '../../components/Footer'
import Link from 'next/link'

const changelog = [
  {
    version: '0.0.2',
    date: '2026-04-04',
    categories: [
      {
        name: '新增',
        items: [
          'busboy multipart 解析，支持文件上传',
          'WebSocket 重构，支持实时事件广播',
          'API 速率限制（120 请求/分钟）',
          '文件 Range 请求支持，优化预览体验',
          '文件预览功能和移动端交互改进',
          '移动端响应式布局（≤768px / ≤480px 断点）',
        ]
      },
      {
        name: '修复',
        items: [
          '大文件上传 OOM（改为 stream 写入临时文件）',
          '上传文件流写入竞态条件',
          '元数据写入损坏（原子写入 tmp + renameSync）',
          'config 文件原子写入防止崩溃损坏',
          '启动时自动清理残留临时上传文件',
          'busboy 中文文件名乱码',
          '文件夹重命名路径拼接问题',
          '重启后文件预览失败（Hyperdrive 存储解耦）',
          '下载完成后无法预览',
          '环境变量解析、CORS 预检、下载状态、busboy 重复监听',
          '安全漏洞修复、魔法常量提取',
        ]
      },
      {
        name: '重构',
        items: [
          '解耦 Hyperdrive 存储与目录结构',
          '文件夹创建改为移动弹窗路径输入',
          '关闭服务按钮移入设置弹窗',
        ]
      },
      {
        name: '测试',
        items: [
          '集成测试超时修复，减少误报',
        ]
      },
      {
        name: '文档',
        items: [
          '添加 AGENTS.md 项目概要',
          '更新 README（npx 使用说明）',
        ]
      },
    ]
  },
  {
    version: '0.0.1',
    date: '2026-01-01',
    categories: [
      {
        name: '新增',
        items: [
          '首次发布',
          '基于 Hyperswarm/Hyperdrive 的 P2P 文件分享',
          '确定性 CID v1 文件发布',
          '大文件流式传输支持（GB 级以上）',
          'CID 完整性验证',
          '自定义 most:// 链接格式用于分享',
          '基于 React 的 Web UI',
          '命令行界面',
          '单元测试与集成测试',
        ]
      },
    ]
  },
]

export default function ChangelogPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: 64 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>更新日志</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 48 }}>
            本项目所有重要变更将记录在此文件中。格式遵循 <a href="https://keepachangelog.com/en/1.0.0/" target="_blank" rel="noopener">Keep a Changelog</a>。
          </p>

          {changelog.map((entry) => (
            <div key={entry.version} style={{ marginBottom: 48, paddingBottom: 48, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{entry.version}</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{entry.date}</span>
              </div>
              {entry.categories.map((cat) => (
                <div key={cat.name} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>{cat.name}</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {cat.items.map((item) => (
                      <li key={item} style={{ padding: '4px 0', paddingLeft: 16, position: 'relative', color: 'var(--text-secondary)', fontSize: 14 }}>
                        <span style={{ position: 'absolute', left: 0 }}>•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}

          <div style={{ marginTop: 48 }}>
            <Link href="/" style={{ color: 'var(--accent)', fontSize: 14 }}>
              ← 返回首页
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
