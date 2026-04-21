export const changelog = [
  {
    version: '0.0.4',
    date: '2026-04-13',
    categories: {
      新增: [
        '远程访问支持：服务器默认监听 0.0.0.0，支持局域网直接访问',
        '设置页新增网络地址展示（本机/局域网/Tailscale/ZeroTier）',
        '设置页新增折叠式远程访问指引',
        'CORS 改为动态反射 Origin 头，支持跨域访问',
        '官网 most.box：首页、文档、更新日志',
      ],
      修复: [
        '修复前端硬编码 localhost URL 导致远程访问下载失败',
        '修复自动开浏览器 URL 在 HOST 为 0.0.0.0 时无法打开',
        '移除欢迎引导弹窗（功能已整合到设置页）',
      ],
    },
  },
  {
    version: '0.0.2',
    date: '2026-04-04',
    categories: {
      新增: [
        'busboy multipart 解析，支持文件上传',
        'WebSocket 重构，支持实时事件广播',
        'API 速率限制（120 请求/分钟）',
        '文件 Range 请求支持，优化预览体验',
        '文件预览功能和移动端交互改进',
        '移动端响应式布局（≤768px / ≤480px 断点）',
      ],
      修复: [
        '大文件上传 OOM（改为 stream 写入临时文件）',
        '元数据写入损坏（原子写入 tmp + renameSync）',
        '启动时自动清理残留临时上传文件',
        'busboy 中文文件名乱码',
        '下载完成后无法预览',
      ],
      重构: ['解耦 Hyperdrive 存储与目录结构', '关闭服务按钮移入设置弹窗'],
    },
  },
  {
    version: '0.0.1',
    date: '2026-01-01',
    categories: {
      新增: [
        '首次发布',
        '基于 Hyperswarm/Hyperdrive 的 P2P 文件分享',
        '确定性 CID v1 文件发布',
        '大文件流式传输支持（GB 级以上）',
        'CID 完整性验证',
        '自定义 most:// 链接格式用于分享',
        '基于 React 的 Web UI',
        '命令行界面',
      ],
    },
  },
]
